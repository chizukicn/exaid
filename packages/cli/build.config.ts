import { defineBuildConfig } from "unbuild"

export default defineBuildConfig({
    entries: ["src/bin", "src/index"],
    externals: ["open-api", "maybe-types"],
    clean: true,
    declaration: true,
    failOnWarn: false,
    rollup: {
        emitCJS: true,
        dts: {
            respectExternal: true
        }
    }
})
