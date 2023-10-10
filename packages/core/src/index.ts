import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import consola from "consola";
import { render } from "ejs";
import json5 from "json5";
import prettier from "prettier";
import { version } from "../package.json";
import type { ExaidConfig } from "./config";
import { defaultModuleBodyTemplate, defaultModuleFooterTemplate, defaultModuleHeaderTemplate, defaultModuleTemplate, defaultTypesTemplate } from "./templates";
import type { HttpMethod, OpenApiModel, OpenApiModelProperty, OpenApiModule, OpenApiOperation, OpenApiRequestParams, OpenApiResult, OpenApiSchema } from "./types";
import { getExternalType, getType } from "./utils";

export const EXAID_VERSION = version;
export interface FetchOpenApiOptions {
  url?: string
}

const REF_REGEX = /^#\/definitions\//g;

function handleRef(ref?: string) {
  if (ref && REF_REGEX.test(ref)) {
    return ref.replace(REF_REGEX, "");
  }
}

function getFieldType(field: OpenApiSchema, imports: string[] = []): string {
  const { type, $ref, items } = field;

  let parameterType: string = "any";
  const refType = handleRef($ref);
  if (refType) {
    const generic = getType(refType);
    const importType = getExternalType(generic);
    imports.push(...importType);
    parameterType = generic.toString();
  } else if (type) {
    if (type === "array") {
      if (items) {
        parameterType = getType("array", [getFieldType({ $ref, ...items }, imports)]).toString();
      }
    } else {
      parameterType = getType(type).toString();
    }
  }
  return parameterType;
}

export async function fetchOpenApi(url: string) {
  const result: OpenApiResult = await axios
    .get<string>(url, {
    responseType: "text"
  })
    .then(r => {
      if (typeof r.data == "string") {
        return json5.parse(r.data);
      }
      return r.data;
    });

  const tags = result.tags ?? [];
  const definitions = result.definitions ?? {};

  const modules: OpenApiModule[] = [];

  const models: OpenApiModel[] = [];

  const afters: (() => void)[] = [];

  for (const [name, define] of Object.entries(definitions)) {
    const defType = getType(name);
    if (!models.find(e => e.name === defType.name)) {
      models.push({
        name: defType.name,
        title: define.title,
        generics: defType.generics.map(e => e.name),
        properties: Object.entries(define.properties ?? {}).reduce<OpenApiModelProperty[]>((acc, [key, value]) => {
          const property: OpenApiModelProperty = {
            ...value,
            name: key,
            required: define.required?.includes(key)
          };

          if (value.type) {
            const type = getType(value.type);
            if (type.name === "array") {
              if (value.items) {
                const ref = handleRef(value.items.$ref);
                if (ref) {
                  const refType = getType(ref);
                  const name = refType.name;
                  afters.push(() => {
                    const target = models.find(e => e.name === name);
                    if (target) {
                      property.type = `${refType.toString()}[]`;
                    } else {
                      consola.error(`${name} not found`);
                    }
                  });
                } else if (value.items.type) {
                  property.type = getType("array", [value.items.type]).toString();
                }
              }
            } else {
              if (defType.generics.some(r => r.name === type.name)) {
                // todo
              }
              property.type = type.toString();
            }
          } else if (value.$ref) {
            const ref = handleRef(value.$ref);
            if (ref) {
              const refType = getType(ref);
              const name = refType.name;
              afters.push(() => {
                const target = models.find(e => e.name === name);
                if (target) {
                  property.type = refType.toString();
                } else {
                  consola.error(`${name} not found`);
                }
              });
            }
          }
          return acc.concat([property]);
        }, [])
      });
    }
  }

  afters.forEach(e => e());

  for (const tag of tags) {
    const operations: OpenApiOperation[] = [];
    let imports: string[] = [];

    for (const pathInfo of Object.entries(result.paths)) {
      // eslint-disable-next-line no-template-curly-in-string
      const path = pathInfo[0].replace(/{([^}]+)}/g, "${$1}");
      const record = pathInfo[1];
      for (const [method, pathData] of Object.entries(record)) {
        if (pathData.tags.includes(tag.name)) {
          let returnType = "";

          const response = pathData.responses["200"];
          if (response?.schema) {
            returnType = getFieldType(response.schema, imports);
          }

          const params = pathData.parameters ?? [];

          const parameters: OpenApiRequestParams[] = [];

          for (const parameter of params) {
            const { type, schema, items } = parameter;

            const parameterType = getFieldType({ items, type, ...schema }, imports);

            parameters.push({
              in: parameter.in,
              name: parameter.name,
              type: parameterType,
              required: parameter.required
            });
          }

          operations.push({ name: pathData.operationId, description: pathData.description, method: method as HttpMethod, path, returnType, parameters });
        }
      }
    }

    imports = Array.from(new Set(imports));

    modules.push({
      name: tag.name,
      description: tag.description,
      operations,
      imports
    });
  }

  return { models, modules, result };
}

export async function generate(option: ExaidConfig) {
  const { dir = ".exaid", url, moduleTemplate } = option;

  const { header = defaultModuleHeaderTemplate, body = defaultModuleBodyTemplate, footer = defaultModuleFooterTemplate, wrapper = defaultModuleTemplate } = moduleTemplate ?? {};

  consola.info(`@exaid/core v${EXAID_VERSION} start fetching ${url}...`);

  const { models, modules, result } = await fetchOpenApi(url);

  fs.mkdirSync(dir, { recursive: true });

  const typeCode = render(defaultTypesTemplate, { models }, { escape: m => m });
  const typeFile = path.join(dir, "types.ts");
  writeCode(typeFile, typeCode);
  consola.success(`${typeFile} was generated.`);

  fs.mkdirSync(`${dir}/modules`, { recursive: true });

  for (const module of modules) {
    const moduleHeader = render(header, module, { escape: m => m });
    const moduleBody = render(body, module, { escape: m => m });
    const moduleFooter = render(footer, module, { escape: m => m });
    const code = render(wrapper, { ...module, moduleHeader, moduleBody, moduleFooter }, { escape: m => m });
    const moduleFile = path.join(dir, "modules", `${module.name}.ts`);
    writeCode(moduleFile, code);
    consola.success(`${moduleFile} was generated.`);
  }

  await writeJson(`${dir}/manifest.json`, { models, modules });
  await writeJson(`${dir}/docs.json`, result);
}

async function writeJson(target: string, data: any) {
  let json = JSON.stringify(data, null, 2);
  try {
    json = await prettier.format(json, { parser: "json" });
  } catch {}
  fs.writeFileSync(target, json);
}

export async function writeCode(target: string, code: string) {
  try {
    code = await prettier.format(code, { parser: "typescript", tabWidth: 2, useTabs: false });
  } catch {
    consola.error(`format error: ${target}`);
  }
  fs.writeFileSync(target, code);
}

export * from "./config";
