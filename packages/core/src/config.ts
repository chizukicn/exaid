import type { MaybeAsyncFunction } from "maybe-types";

export type UserConfigExport = MaybeAsyncFunction<ExaidConfig, true>;

export function defineConfig(config: UserConfigExport): UserConfigExport {
  return config;
}

export interface ExaidModuleTemplate {
  header?: string

  body?: string

  footer?: string

  wrapper?: string
}

export interface ExaidConfig {
  url: string

  dir?: string

  moduleTemplate?: ExaidModuleTemplate
}
