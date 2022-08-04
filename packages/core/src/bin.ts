import { program } from "commander"
import { generate } from "openapi-export"

program
    .argument("<url>")
    .option("-t, --target <target>")
    .action(async (url, cmd) => {
        generate({
            url,
            dir: cmd.target
        })
    })
    .parse(process.argv)
