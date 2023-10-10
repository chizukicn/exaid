export type OpenApiBaseType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "file" | "binary" | "null";

export type OpenApiParameterIn = "query" | "header" | "path" | "cookie" | "formData";

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options" | "trace" | "connect" | "link" | "unlink";

export type HttpStatusCode = "200" | "201" | "401" | "403" | "404";

export interface OpenApiSchema {
  $ref?: string
  type?: OpenApiBaseType
  items?: OpenApiSchema
}

export interface OpenApiTag {
  name: string
  description: string
}

export interface OpenApiField {
  type: OpenApiBaseType
  schema?: OpenApiSchema
  items?: OpenApiSchema
}
export interface OpenApiPath {
  tags: string[]
  summary: string
  description: string
  operationId: string
  consumes: string[]
  produces: string[]
  parameters: (OpenApiField & {
    name: string
    in: OpenApiParameterIn
    description: string
    required: boolean
  })[]
  responses: Record<
  HttpStatusCode,
  {
    description: string
    schema?: OpenApiSchema
  }
  >
}

export interface OpenApiProperty {
  type: OpenApiBaseType
  $ref?: string
  items?: OpenApiSchema
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
  host: string
  basePath: string
  tags: OpenApiTag[]
  paths: Record<string, Record<HttpMethod, OpenApiPath>>
  definitions: Record<string, OpenApiDefinition>
}

export interface OpenApiOperation {
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
  operations: OpenApiOperation[]
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
  generics?: string[]
}

export interface OpenApiRequestParams {
  name: string
  required: boolean
  type: string
  in: OpenApiParameterIn
}
