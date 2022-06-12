
import fetch from "node-fetch"
export interface FetchOpenApiOptions{
    url?: string;
}

interface OpenApiTag{
    name: string;
    description: string;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'| 'head' | 'options' | 'trace' | 'connect'| 'link' | 'unlink';
 
export type HttpStatusCode = "200" | "201" | "401" | "403" | "404"

export type OpenApiBaseType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "file" | "binary" | "null";


export interface OpenApiSchema{
    $ref:string
}

export interface OpenApiParameter{
    in: string
    name: string
    description: string
    required: boolean
    schema: OpenApiSchema
}

export interface OpenApiResponse{
    description: string
    schema?: OpenApiSchema
}

export interface OpenApiPath{
    tags: string[]
    summary: string
    description: string
    operationId: string
    consumes: string[]
    produces: string[]
    parameters: OpenApiParameter[]
    response: Record<HttpStatusCode,OpenApiResponse>
}

export type OpenApiPaths = Record<string, Record<HttpMethod, OpenApiPath>>


export interface OpenApiProperty{
    type: OpenApiBaseType
    items?: OpenApiSchema
    description: string
    format?: string
    example?: string
}


export interface OpenApiDefinition {
    type: OpenApiBaseType
    required: string[]
    properties: Record<string, OpenApiProperty>
}

export interface OpenApiResult {
    tags: OpenApiTag[]
    paths: OpenApiPaths
    definitions: Record<string, OpenApiDefinition>
}

interface OpenApiOperation{
    name: string
    path: string
    method: HttpMethod
    description: string
}



export interface OpenApiModule {
    name: string
    description: string
    paths: OpenApiOperation[]
}


export async function fetchOpenApi(url:string) {
    const result = await fetch(url).then(r => r.json()) as  OpenApiResult;
    const tags = result.tags ?? []

    const modules: OpenApiModule[] = []

    for (let tag of tags) {

        const paths:OpenApiOperation[] = []

        for (let [path,record] of Object.entries(result.paths)) {
            
            for (let [method, pathData] of Object.entries(record)) {
                if (pathData.tags.includes(tag.name)) {
                    paths.push({name:pathData.operationId,description:pathData.description, method:method as HttpMethod, path})
                }    
            }
        }

       modules.push({
            name: tag.name,
            description: tag.description,
            paths
        })
    }
    return modules
}

fetchOpenApi("http://47.96.93.177/testclientapi/v2/api-docs").then(r=>console.log(JSON.stringify(r)))