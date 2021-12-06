import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  clean: true,
  sourcemap: true,
  dts: true,
  minify: !options.watch,
  entryPoints: {
    ["index"]: "src/index.ts",
    ["react/index"]: "src/react/index.ts",
    ["redux/index"]: "src/redux/index.ts",
    ["query/index"]: "src/query/index.ts",
  },
}));
