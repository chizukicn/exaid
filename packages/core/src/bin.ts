#!/usr/bin/env node
import { program } from "commander"
import { loadConfig } from "unconfig"
import type { ExaidConfig } from "./config"
import { generate } from "./index"

program
    .argument("[url]")
    .option("-t, --target <target>")
    .option("-c, --config <config>")
    .action(async (url, cmd) => {
        const { config } = await loadConfig<ExaidConfig>({
            sources: [
                {
                    files: "exaid.config",
                    extensions: ["ts", "js", "json", "mts", "mjs", "cjs", "cts", ""],
                    rewrite(obj) {
                        return obj
                    }
                },
                {
                    files: "package.json",
                    extensions: [],
                    rewrite(config: any) {
                        return config.exaid
                    }
                }
            ],
            merge: false,
            defaults: {
                url: url,
                target: cmd.target
            }
        })
        await generate(config)
    })
    .parse(process.argv)
