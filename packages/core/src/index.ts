import axios from "axios"
import { render } from "ejs"
import fs from "fs"
import json5 from "json5"
import prettier from "prettier"
import { ExaidConfig } from "./config"
import { defaultModuleBodyTemplate, defaultModuleFooterTemplate, defaultModuleHeaderTemplate, defaultModuleTemplate, defaultTypesTemplate } from "./templates"
import type { HttpMethod, OpenApiModel, OpenApiModelProperty, OpenApiModule, OpenApiOperation, OpenApiRequestParams, OpenApiResult, OpenApiSchema } from "./types"
import { getExternalType, getType } from "./utils"

export interface FetchOpenApiOptions {
    url?: string
}

const REF_REGEX = /^#\/definitions\//g

function handleRef(ref?: string) {
    if (ref && REF_REGEX.test(ref)) {
        return ref.replace(REF_REGEX, "")
    }
}

function getFieldType(field: OpenApiSchema, imports: string[] = []): string {
    let { type, $ref, items } = field

    let parameterType: string = "any"
    let refType = handleRef($ref)
    if (refType) {
        const generic = getType(refType)
        const importType = getExternalType(generic)
        imports.push(...importType)
        parameterType = generic.toString()
    } else if (type) {
        if (type == "array") {
            if (items) {
                parameterType = getType("array", [getFieldType({ $ref, ...items }, imports)]).toString()
            }
        } else {
            parameterType = getType(type).toString()
        }
    }
    return parameterType
}

export async function fetchOpenApi(url: string) {
    const result: OpenApiResult = await axios
        .get<string>(url, {
            responseType: "text"
        })
        .then(r => {
            if (typeof r.data == "string") {
                return json5.parse(r.data)
            }
            return r.data
        })

    const tags = result.tags ?? []
    const definitions = result.definitions ?? {}

    const modules: OpenApiModule[] = []

    const models: OpenApiModel[] = []

    const afters: (() => void)[] = []

    for (let [name, define] of Object.entries(definitions)) {
        name = getType(name).name
        if (!models.find(e => e.name === name)) {
            models.push({
                name,
                title: define.title,
                properties: Object.entries(define.properties ?? {}).reduce<OpenApiModelProperty[]>((acc, [key, value]) => {
                    const type = getType(value.type)

                    const property: OpenApiModelProperty = {
                        ...value,
                        name: key,
                        required: define.required?.includes(key),
                        type: type.toString()
                    }
                    if (value.type === "array") {
                        if (value.items) {
                            const ref = handleRef(value.items.$ref)
                            if (ref) {
                                const name = getType().name
                                afters.push(() => {
                                    const target = models.find(e => e.name === name)
                                    if (target) {
                                        property.type = `${getType(target.name).toString()}[]`
                                    } else {
                                        console.error(`${name} not found`)
                                    }
                                })
                            } else if (value.items.type) {
                                property.type = getType("array", [value.items.type]).toString()
                            }
                        }
                    }
                    return acc.concat([property])
                }, [])
            })
        }
    }

    afters.forEach(e => e())

    for (let tag of tags) {
        const operations: OpenApiOperation[] = []
        let imports: string[] = []

        for (let [path, record] of Object.entries(result.paths)) {
            path = path.replace(/\{([^\}]+)\}/g, "${$1}")
            for (let [method, pathData] of Object.entries(record)) {
                if (pathData.tags.includes(tag.name)) {
                    let returnType = ""

                    const response = pathData.responses["200"]
                    if (response?.schema) {
                        returnType = getFieldType(response.schema, imports)
                    }

                    const params = pathData.parameters ?? []

                    const parameters: OpenApiRequestParams[] = []

                    for (let parameter of params) {
                        let { type, schema, items } = parameter

                        const parameterType = getFieldType({ items, type, ...schema }, imports)

                        parameters.push({
                            in: parameter.in,
                            name: parameter.name,
                            type: parameterType,
                            required: parameter.required
                        })
                    }

                    operations.push({ name: pathData.operationId, description: pathData.description, method: method as HttpMethod, path, returnType, parameters })
                }
            }
        }

        imports = Array.from(new Set(imports))

        modules.push({
            name: tag.name,
            description: tag.description,
            operations,
            imports
        })
    }

    return { models, modules, result }
}

export async function generate(option: ExaidConfig) {
    const { dir = ".spec", url, moduleTemplate } = option

    const { header = defaultModuleHeaderTemplate, body = defaultModuleBodyTemplate, footer = defaultModuleFooterTemplate, wrapper = defaultModuleTemplate } = moduleTemplate ?? {}

    fs.mkdirSync(dir, { recursive: true })
    const { models, modules, result } = await fetchOpenApi(url)

    const typeCode = render(defaultTypesTemplate, { models }, { escape: m => m })
    writeCode(`${dir}/types.ts`, typeCode)

    for (let module of modules) {
        const moduleHeader = render(header, module, { escape: m => m })
        const moduleBody = render(body, module, { escape: m => m })
        const moduleFooter = render(footer, module, { escape: m => m })
        const code = render(wrapper, { ...module, moduleHeader, moduleBody, moduleFooter }, { escape: m => m })
        writeCode(`${dir}/${module.name}.ts`, code)
    }

    writeJson(`${dir}/manifest.json`, { models, modules })
    writeJson(`${dir}/docs.json`, result)
}

function writeJson(target: string, data: any) {
    let json = JSON.stringify(data, null, 2)
    try {
        json = prettier.format(json, { parser: "json" })
    } catch {}
    fs.writeFileSync(target, json)
}

export function writeCode(target: string, code: string) {
    try {
        code = prettier.format(code, { parser: "typescript", tabWidth: 4, useTabs: false })
    } catch {
        console.error(`format error: ${target}`)
    }
    fs.writeFileSync(target, code)
}

export * from "./config"
