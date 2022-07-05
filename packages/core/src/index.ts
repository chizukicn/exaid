import axios from "axios"
import { render } from "ejs"
import fs from "fs"
import nunjucks from "nunjucks"
import type { OpenApiModel, OpenApiModelProperty, OpenApiModule, OpenApiOperation, OpenApiRequestParams, OpenApiResult } from "open-api"
import prettier from "prettier"
import { deafaultModuleFooterTemplate, defaultModuleBodyTempalte, defaultModuleHeaderTemplate, defaultModuleTemplate, defaultTypesTemplate } from "./templates"

const baseTypes = ["string", "number", "boolean", "array", "any", "void", "undefined", "null"]

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options" | "trace" | "connect" | "link" | "unlink"

export type HttpStatusCode = "200" | "201" | "401" | "403" | "404"

const typeMap: Record<string, string> = {
    integer: "number",
    bigdecimal: "number",
    decimal: "number",
    float: "number",
    double: "number",
    date: "string",
    int: "number",
    List: "array",
    object: "Record",
    Map: "Record",
    Set: "array",
    file: "File"
}

export interface Type {
    name: string
    generic: Type[]
    toString(): string
}

function getExternalType(param: string | Type, lib: string[] = []): string[] {
    const type = typeof param === "string" ? getType(param) : param
    const types: string[] = []
    if (!lib.includes(type.name) && !baseTypes.includes(type.name)) {
        types.push(type.name)
    }
    if (type.generic.length) {
        type.generic.forEach(e => types.push(...getExternalType(e, lib)))
    }
    return types
}

export interface FetchOpenApiOptions {
    url?: string
}

const REF_REGEX = /^#\/definitions\//g

function handleRef(ref?: string) {
    console.log(ref, ref?.match(REF_REGEX))
    if (ref && REF_REGEX.test(ref)) {
        return ref.replace(REF_REGEX, "")
    }
}

export async function fetchOpenApi(url: string) {
    const result = await axios.get<OpenApiResult>(url).then(r => r.data)
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
                                property.type = getType(value.items.type).toString()
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
                    let returnType = "any"

                    const response = pathData.responses["200"]
                    if (response) {
                        const { type, schema } = response
                        console.log("type", type)
                        console.log("schema", schema)
                        if (type) {
                            returnType = getType(type).toString()
                            console.log(returnType)
                        } else if (schema) {
                            const ref = handleRef(schema.$ref)
                            console.log("ref", ref)
                            if (ref) {
                                console.log(ref)
                                const target = models.find(e => e.name === ref)
                                const generic = getType(ref)
                                if (target) {
                                    returnType = generic.toString()
                                    const importType = getExternalType(generic, baseTypes)
                                    imports.push(...importType)
                                }
                            }
                        }
                    }
                    console.log("returnType", returnType)

                    const parameters: OpenApiRequestParams[] = []

                    for (let parameter of pathData.parameters) {
                        let { type, schema } = parameter

                        let paramterType: string = "any"

                        if (!type) {
                            if (schema?.$ref) {
                                const ref = handleRef(schema?.$ref)
                                if (ref) {
                                    const generic = getType(ref)
                                    const importType = getExternalType(generic, baseTypes)
                                    imports.push(...importType)
                                    paramterType = generic.toString()
                                }
                            }
                        } else {
                            paramterType = getType(type).toString()
                        }
                        parameters.push({
                            in: parameter.in,
                            name: parameter.name,
                            type: paramterType,
                            required: parameter.required
                        })
                    }

                    operations.push({ name: pathData.operationId, description: pathData.description, method: method as HttpMethod, path, returnType, parameters })
                }
            }
        }

        imports = Array.from(new Set(imports)).filter(e => !baseTypes.includes(e))

        modules.push({
            name: tag.name,
            description: tag.description,
            operations,
            imports
        })
    }

    return { models, modules, result }
}

function splitGeneric(type: string) {
    const generic: string[] = []
    let start = 0
    let isGeneric = false
    for (let end = 0; end < type.length; end++) {
        switch (type[end]) {
            case "<":
                isGeneric = true
                break
            case ">":
                isGeneric = false
                break
            case ",":
                if (!isGeneric) {
                    generic.push(type.slice(start, end))
                    start = end + 1
                }
                break
        }
    }
    if (start < type.length) {
        generic.push(type.slice(start))
    }
    return generic
}

function getType(type: string = "any"): Type {
    if (!baseTypes.includes(type)) {
        type = type.replaceAll(/«/g, "<").replaceAll(/»/g, ">")
    }
    let name = type

    let generic: Type[] = []

    if (type.endsWith("[]")) {
        const genericType = getType(type.slice(0, -2))
        name = "array"
        generic = [genericType]
    } else {
        const startIndex = type.indexOf("<")
        const endIndex = type.lastIndexOf(">")
        if (startIndex > -1) {
            name = type.slice(0, startIndex)
            if (endIndex > -1) {
                type = type.slice(startIndex + 1, endIndex)
                generic = splitGeneric(type).map(e => getType(e))
            }
        }

        name = typeMap[name] ?? name
    }

    return {
        name,
        generic,
        toString() {
            if (name == "array") {
                return `${generic[0]?.toString() ?? "any"}[]`
            }
            return generic.length > 0 ? `${name}<${generic.map(e => e.toString()).join(",")}>` : name
        }
    }
}

interface ExportModuleTemplate {
    header?: string
    body?: string
    footer?: string
    wrapper?: string
}

interface ExportOptions {
    url: string
    dir?: string

    transformTypes?: (types: string) => string

    transformModuleFooter?: string

    transformModuleName?: (module: string) => string

    moduleTemplate?: ExportModuleTemplate

    transformReturnType?: (returnType: string) => string

    instanceName?: string

    importInstance?: boolean

    instancePackage?: string

    commonTypes?: string[]

    transformModelType?: (type: string) => string
}

export async function generate(option: ExportOptions) {
    const { dir = ".spec", url, moduleTemplate } = option
    const { header = defaultModuleHeaderTemplate, body = defaultModuleBodyTempalte, footer = deafaultModuleFooterTemplate, wrapper = defaultModuleTemplate } = moduleTemplate ?? {}

    fs.mkdirSync(dir, { recursive: true })
    const { models, modules, result } = await fetchOpenApi(url)

    nunjucks.configure({
        autoescape: false
    })

    const typeCode = render(defaultTypesTemplate, { models })
    writeCode(`${dir}/types.ts`, typeCode)

    for (let module of modules) {
        const moduleHeader = render(header, module)
        const moduleBody = render(body, module)
        const moduleFooter = render(footer, module)
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
        code = prettier.format(code, { parser: "typescript" })
    } catch {
        console.error(`format error: ${target}`)
    }
    fs.writeFileSync(target, code)
}
