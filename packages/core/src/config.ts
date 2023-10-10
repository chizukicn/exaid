export type UserConfigExport = ExaidConfig | Promise<ExaidConfig> | (() => ExaidConfig | Promise<ExaidConfig>);

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
