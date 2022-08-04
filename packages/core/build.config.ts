import { defineBuildConfig } from "unbuild"

export default defineBuildConfig({
    entries: ["src/index", "src/bin"],
    externals: ["open-api"],
    clean: true,
    declaration: true,
    rollup: {
        emitCJS: true,
        dts: {
            respectExternal: false
        }
    }
})
