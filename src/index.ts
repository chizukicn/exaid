import axios from "axios"
import fs from "fs"
import type { OpenApiModel, OpenApiModelProperty, OpenApiModule, OpenApiOperation, OpenApiRequestParams, OpenApiResult } from "open-api"
import prettier from "prettier"
import nunjucks from "nunjucks"
import path from "path"

const baseTypes = ["string", "number", "boolean", "Array", "any", "void", "undefined", "null"]

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options" | "trace" | "connect" | "link" | "unlink"

export type HttpStatusCode = "200" | "201" | "401" | "403" | "404"

export type OpenApiBaseType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "file" | "binary" | "null"

const typeMap: Record<string, string> = {
    integer: "number",
    bigdecimal: "number",
    decimal: "number",
    date: "string",
    int: "number",
    List: "Array",
    Map: "Record",
    Set: "Array"
}

function getExternalType(type: ExportType, baseTypes: string[] = []): string[] {
    const types: string[] = []
    if (!baseTypes.includes(type.name)) {
        types.push(type.name)
    }
    if (type.generic.length) {
        type.generic.forEach(e => types.push(...getExternalType(e, baseTypes)))
    }
    return types
}

const ts = getExternalType(getType("List<HttpResponse<string>,HttpResponse<Goods[]>>"), baseTypes)
console.log(ts, getType("List<HttpResponse<string>,HttpResponse<Goods[]>>"))
export interface FetchOpenApiOptions {
    url?: string
}

export async function fetchOpenApi(url: string) {
    const result = await axios.get<OpenApiResult>(url).then(r => r.data)
    const tags = result.tags ?? []
    const definitions = result.definitions ?? {}

    const modules: OpenApiModule[] = []

    const models: OpenApiModel[] = []

    const refs: (() => void)[] = []

    for (let [name, define] of Object.entries(definitions)) {
        name = getType(name).name
        if (!models.find(e => e.name === name)) {
            models.push({
                name,
                title: define.title,
                properties: Object.entries(define.properties).reduce<OpenApiModelProperty[]>((acc, [key, value]) => {
                    const type = getType(value.type)

                    const property: OpenApiModelProperty = {
                        ...value,
                        name: key,
                        required: define.required?.includes(key),
                        type: type.toString()
                    }
                    if (value.type === "array") {
                        if (value.items) {
                            if (value.items.$ref) {
                                const ref = getType(value.items.$ref.replace(/^#\/definitions\//, "")).name
                                refs.push(() => {
                                    const target = models.find(e => e.name === ref)
                                    if (target) {
                                        property.type = `${getType(target.name).toString()}[]`
                                    } else {
                                        console.error(`${ref} not found`)
                                    }
                                })
                            } else if (value.items.type) {
                                property.type = getType(value.items.type).toString()
                            }
                        }
                    }
                    return acc.concat([property])
                }, [])
            })
        }
    }

    refs.forEach(e => e())

    for (let tag of tags) {
        const paths: OpenApiOperation[] = []
        let imports: string[] = []

        for (let [path, record] of Object.entries(result.paths)) {
            for (let [method, pathData] of Object.entries(record)) {
                if (pathData.tags.includes(tag.name)) {
                    let returnType = "any"

                    const response = pathData.responses["200"]
                    if (response.schema) {
                        if (response.schema.$ref) {
                            const ref = response.schema.$ref.replace(/^#\/definitions\//, "")
                            const target = models.find(e => e.title === ref)
                            const generic = getType(ref)
                            if (target) {
                                returnType = generic.toString()
                                const importType = getExternalType(generic, baseTypes)
                                imports.push(...importType)
                            }
                        }
                    }

                    const parameters: OpenApiRequestParams[] = []

                    for (let parameter of pathData.parameters) {
                        const generic = getType(parameter.schema.$ref.replace(/^#\/definitions\//, ""))
                        const importType = getExternalType(generic, baseTypes)
                        imports.push(...importType)
                        parameters.push({
                            name: parameter.name,
                            type: generic.toString(),
                            required: parameter.required
                        })
                    }

                    paths.push({ name: pathData.operationId, description: pathData.description, method: method as HttpMethod, path, returnType, parameters })
                }
            }
        }

        imports = Array.from(new Set(imports)).filter(e => !baseTypes.includes(e))

        modules.push({
            name: tag.name,
            description: tag.description,
            paths,
            imports
        })
    }
    console.log(models, modules.map(e => {
        return {
            ...e,
            paths: e.paths.map(f => {
                return  JSON.stringify(f)
                
            }),
        }
    }))
    return { models, modules }
}

interface ExportType {
    name: string
    generic: ExportType[]

    toString(): string
}

function getType(type: string = "any"): ExportType {
    if (!baseTypes.includes(type)) {
        type = type.replaceAll(/«/g, "<").replaceAll(/»/g, ">")
    }

    let name = type

    let generic: ExportType[] = []

    if (type.endsWith("[]")) {
        const genericType = getType(type.slice(0, -2))
        name = "Array"
        generic = [genericType]
    } else {
        const startIndex = type.indexOf("<")
        const endIndex = type.lastIndexOf(">")
        if (startIndex > -1) {
            name = type.slice(0, startIndex)
            if (endIndex > -1) {
                generic = type
                    .slice(startIndex + 1, endIndex)
                    .split(",")
                    .map(e => getType(e))
            }
        }

        name = typeMap[name] ?? name
    }

    return {
        name,
        generic,
        toString() {
            if (name == "Array") {
                return `${generic[0].toString()}[]`
            }
            return generic.length > 0 ? `${name}<${generic.map(e => e.toString()).join(",")}>` : name
        }
    }
}

interface ExportOptions {
    url: string
    dir?: string

    transformTypes?: (types: string) => string

    transformModule?: (module: string) => string

    transformModuleHeader?: (module: string) => string

    transformModuleBody?: (module: string) => string

    transformModuleFooter?: string

    transformModuleName?: (module: string) => string

    transformReturnType?: (returnType: string) => string

    instanceName?: string

    importInstance?: boolean

    instancePackage?: string

    commonTypes?: string[]


    transformModelType?: (type: string) => string
}

export async function generate(option: ExportOptions) {
    const { dir = ".spec", url } = option
    fs.mkdirSync(dir, { recursive: true })
    const { models, modules } = await fetchOpenApi(url)

    const typeTemplate =  fs.readFileSync(path.resolve(process.cwd(),"templates/types.njk"),"utf-8")

    nunjucks.configure({
        autoescape: false,
    })

    const typeCode = nunjucks.renderString(typeTemplate,{models})
    writeCode(`${dir}/types.ts`, typeCode)

    const moduleTemplate = fs.readFileSync(path.resolve(process.cwd(),"templates/module.njk"),"utf-8")

    for (let module of modules) {
        const code = nunjucks.renderString(moduleTemplate,module)
        writeCode(`${dir}/${module.name}.ts`, code)
    }

    let manifest = JSON.stringify({ models, modules })
    try {
        manifest = prettier.format(manifest, { parser: "json" })
    } catch {}
    fs.writeFileSync(`${dir}/manifest.json`, manifest)
}

export function writeCode(target: string, code: string) {
    try {
        code = prettier.format(code, { parser: "typescript" })
    } catch {
        console.error(`format error: ${target}`)
    }
    fs.writeFileSync(target, code)
}


