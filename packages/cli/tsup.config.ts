import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Binary entry — bundled with shebang, no types needed
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node18",
    dts: false,
    sourcemap: false,
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
    // Bundle @rsfc/core so the CLI binary is self-contained
    external: ["sass", "less", "stylus"],
  },
  {
    // Public API (compileFile, parseFile) — separately bundled for programmatic use
    entry: ["src/compile.ts"],
    format: ["esm"],
    target: "node18",
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["sass", "less", "stylus"],
  },
]);
