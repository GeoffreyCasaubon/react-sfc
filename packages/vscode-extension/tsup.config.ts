import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Extension host — runs inside VS Code's extension host process
    entry: { extension: "src/extension.ts" },
    format: ["cjs"],
    platform: "node",
    target: "node18",
    external: ["vscode"],
    sourcemap: true,
    clean: true,
    outDir: "dist",
  },
  {
    // Language Server — runs as an independent child process via IPC
    entry: { server: "src/server/server.ts" },
    format: ["cjs"],
    platform: "node",
    target: "node18",
    noExternal: ["@g-casau/rsfc-core"],
    sourcemap: true,
    outDir: "dist",
  },
]);
