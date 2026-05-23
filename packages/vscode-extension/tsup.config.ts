import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Extension host — runs inside VS Code's extension host process
    entry: { extension: "src/extension.ts" },
    format: ["cjs"],
    platform: "node",
    target: "node18",
    // vscode is provided by the VS Code runtime; bundle every vscode-* LSP library
    external: ["vscode"],
    noExternal: [/^vscode-/, /^@g-casau\//, "typescript"],
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
    noExternal: [/^vscode-/, /^@g-casau\//, /^@volar\//, /^vscode-uri$/, 'volar-service-typescript'],
    sourcemap: true,
    outDir: "dist",
  },
]);
