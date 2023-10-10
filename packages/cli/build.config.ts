import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/bin", "src/index"],
  clean: true,
  declaration: true,
  failOnWarn: false,
  rollup: {
    emitCJS: true
  }
});
