import { defineBuildConfig } from "unbuild"

export default defineBuildConfig({
    entries: ["src/index", "src/bin"],
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
