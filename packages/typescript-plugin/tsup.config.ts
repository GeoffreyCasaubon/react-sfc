import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // TypeScript language service plugins MUST be CommonJS — tsserver loads
  // them via require() and does not support ESM plugins.
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  outDir: "dist",
  clean: true,
});
