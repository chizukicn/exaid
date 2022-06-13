import axios from "axios"
import fs from "fs"
import prettier from "prettier"
export interface FetchOpenApiOptions {
    url?: string
}

interface OpenApiTag {
    name: string
    description: string
}

const baseTypes = ["string", "number", "boolean", "Array", "any", "void", "undefined", "null"]

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options" | "trace" | "connect" | "link" | "unlink"

export type HttpStatusCode = "200" | "201" | "401" | "403" | "404"

export type OpenApiBaseType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "file" | "binary" | "null"

export interface OpenApiSchema {
    $ref: string
}

export interface OpenApiParameter {
    in: string
    name: string
    description: string
    required: boolean
    schema: OpenApiSchema
}

export interface OpenApiResponse {
    description: string
    schema?: OpenApiSchema
}

export interface OpenApiPath {
    tags: string[]
    summary: string
    description: string
    operationId: string
    consumes: string[]
    produces: string[]
    parameters: OpenApiParameter[]
    responses: Record<HttpStatusCode, OpenApiResponse>
}

export type OpenApiPaths = Record<string, Record<HttpMethod, OpenApiPath>>

export interface OpenApiProperty {
    type: OpenApiBaseType
    items?: OpenApiSchema & { type?: OpenApiBaseType }
    description: string
    format?: string
    example?: string
}

export interface OpenApiDefinition {
    type: OpenApiBaseType
    title?: string
    required: string[]
    properties: Record<string, OpenApiProperty>
}

export interface OpenApiResult {
    tags: OpenApiTag[]
    paths: OpenApiPaths
    definitions: Record<string, OpenApiDefinition>
}

interface OpenApiOperation {
    name: string
    path: string
    method: HttpMethod
    description: string
    returnType: string
    parameters: OpenApiRequestParams[]
}

export interface OpenApiModule {
    name: string
    description: string
    paths: OpenApiOperation[]
    imports: string[]
}

export interface OpenApiModelProperty extends Omit<OpenApiProperty, "type"> {
    name: string
    required: boolean
    type: string
}

export interface OpenApiModel {
    name: string
    title?: string
    properties: OpenApiModelProperty[]
}

export interface OpenApiRequestParams {
    name: string
    required: boolean
    type: string
}

function getExternalType(type: OpenApiType) {
    const types: string[] = []
    if (!baseTypes.includes(type.name)) {
        types.push(type.name)
    }
    if (type.generic.length) {
        type.generic.forEach(e => types.push(...getExternalType(e)))
    }
    return types
}

export async function fetchOpenApi(url: string, commonTypes: string[] = []) {
    const result = await axios.get<OpenApiResult>(url).then(r => r.data)
    const tags = result.tags ?? []
    const definitions = result.definitions ?? {}

    const modules: OpenApiModule[] = []

    const models: OpenApiModel[] = []

    const refs: (() => void)[] = []

    for (let [name, define] of Object.entries(definitions)) {
        name = getType(name).name
        if (!models.find(e => e.name === name) && !commonTypes.includes(name)) {
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
                            if (target || commonTypes.includes(generic.name)) {
                                returnType = generic.toString()
                                const importType = getExternalType(generic)
                                imports.push(...importType)
                            }
                        }
                    }

                    const parameters: OpenApiRequestParams[] = []

                    for (let parameter of pathData.parameters) {
                        const generic = getType(parameter.schema.$ref.replace(/^#\/definitions\//, ""))
                        const importType = getExternalType(generic)
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
    return { models, modules }
}

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

interface OpenApiType {
    name: string
    generic: OpenApiType[]

    toString(): string
}

function getType(type: string = "any"): OpenApiType {
    if (!baseTypes.includes(type)) {
        type = type.replaceAll(/«/g, "<").replaceAll(/»/g, ">")
    }

    let name = type

    let generic: OpenApiType[] = []

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

interface GenerateOptions {
    url: string
    dir?: string

    transformTypes?: (types: string) => string

    transformModule?: (module: string) => string

    transformModuleHeader?: (module: string) => string

    transformModuleBody?: (module: string) => string

    transformModuleFooter?: string

    transformModuleName?: (module: string) => string

    instanceName?: string

    importInstance?: boolean

    instancePackage?: string

    commonTypes?: string[]

    transformModelType?: (type: string) => string
}

export async function generate(option: GenerateOptions) {
    const { dir = ".spec", instanceName = "_instance", importInstance = true, instancePackage = "axios", url } = option
    fs.mkdirSync(dir, { recursive: true })
    const { models, modules } = await fetchOpenApi(url)

    let typeCode = ""
    for (let model of models) {
        typeCode += `/**\n`
        typeCode += ` * @title ${model.title}\n`
        typeCode += ` */\n`

        typeCode += `export interface ${model.name} {\n`
        for (let property of model.properties) {
            if (property.description) {
                typeCode += `    /** \n`
                typeCode += `    *  @description ${property.description} \n`
                typeCode += `    **/ \n`
            }
            typeCode += `    ${property.name}${property.required ? "?" : ""}: ${property.type}\n`
        }
        typeCode += `}\n`
        typeCode += `\n`
    }

    typeCode = option.transformTypes?.(typeCode) ?? typeCode
    writeCode(`${dir}/types.ts`, typeCode)

    for (let module of modules) {
        let headerCode = ""
        if (importInstance) {
            headerCode += `import ${instanceName} from "${instancePackage}"\n`
        }
        if (module.imports.length > 0) {
            headerCode += `import {${module.imports.join(",")}} from "./types"\n`
        }

        headerCode = option.transformModuleHeader?.(headerCode) ?? headerCode

        let bodyCode = `{\n`
        bodyCode += `     \n`
        for (let operation of module.paths) {
            bodyCode += `    /** \n`
            bodyCode += `    *  @description ${operation.description} \n`
            bodyCode += `    **/  \n`
            bodyCode += `    ${operation.name}(${operation.parameters.map(e => `${e.name}:${e.type}`).join(",")}){\n`

            bodyCode += `        return ${instanceName}.${operation.method}<${operation.returnType}>("${operation.path}"`
            const paramterNames = operation.parameters.map(e => e.name)
            if (paramterNames.length > 0) {
                bodyCode += ","
                if (paramterNames.length > 1) {
                    bodyCode += `{...${paramterNames.join(",")}}`
                } else {
                    bodyCode += paramterNames[0]
                }
            }

            bodyCode += ")\n"
            bodyCode += `    },\n`
        }
        bodyCode += `}\n`

        bodyCode = option.transformModuleBody?.(bodyCode) ?? bodyCode

        let code = ""
        code += headerCode
        code += `export default ${bodyCode}`
        if (option.transformModuleFooter) {
            code += "\n"
            code += option.transformModuleFooter
        }
        code = option.transformModule?.(code) ?? code

        const name = option.transformModuleName?.(module.name) ?? module.name
        if (code) {
            //     code = prettier.format(code, { parser: "typescript" })
            writeCode(`${dir}/${name}.ts`, code)
        }
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

export function generateWithFunction(url: string, dir?: string) {
    return generate({
        url,
        dir,
        transformTypes: (types: string) => {
            return `
    export interface HttpResponse<T = unknown> {
        msg: string
        code: string
        data: T
        succ: boolean
    }

    export interface PagingData<T>{
        currentPageIndex:number
        items:T[]
        nextIndex:number
        pageSize:number
        previousIndex:number
        startIndex:number
        totalCount:number
        totalPageCount:number
    }
    
    ${types}`
        },
        importInstance: false,
        transformModuleHeader(header: string) {
            return `import {defineRequest} from "./common"\n${header}`
        },
        transformModuleBody(body: string) {
            return `defineRequest(_instance=>(${body}))`
        }
    })
}

