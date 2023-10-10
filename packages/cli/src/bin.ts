#!/usr/bin/env node
import type { ExaidConfig } from "@exaid/core";
import { EXAID_VERSION, generate } from "@exaid/core";
import { program } from "commander";
import { loadConfig } from "unconfig";

program.name("exaid").version(`v${EXAID_VERSION}`, "-v, --version", "output the current version");

program
  .argument("[url]")
  .option("-d, --dir <dir>", "target directory")
  .option("-c, --config <config>", "config file")
  .action(async (url, cmd) => {
    const { config } = await loadConfig <ExaidConfig>({
      sources: [
        {
          files: "exaid.config",
          extensions: ["ts", "js", "json", "mts", "mjs", "cjs", "cts", ""],
          rewrite(obj: any) {
            return obj;
          }
        },
        {
          files: "package.json",
          extensions: [],
          rewrite(config: any) {
            return config.exaid;
          }
        }
      ],
      merge: false,
      defaults: {
        url,
        dir: cmd.dir
      }
    });
    if (!config.url) {
      console.error("missing required argument 'url'");
      process.exit(1);
    }
    await generate(config);
  });

program
  .command("ui")
  .description("start the web ui")
  .action(() => {
    // console.log("ui");
  });

program.parse();

export {};
