---
name: vscode-agent
description: VS Code extension specialist for the RSFC VS Code extension package
---

# VS Code Extension Agent

Specialist for `packages/vscode-extension`.

## Package overview

| File | Role |
|---|---|
| `src/extension.ts` | Extension host: spawns the Language Server via IPC |
| `src/server/server.ts` | Language Server: diagnostics, hover, symbols, completion |
| `syntaxes/rsfc.tmLanguage.json` | TextMate grammar with embedded language injection |
| `snippets/rsfc.json` | VS Code snippets for all RSFC block types |
| `language-configuration.json` | Brackets, auto-closing pairs |
| `tsup.config.ts` | Two CJS bundles: `dist/extension.js` + `dist/server.js` |

## Architecture

- **Extension host** (`extension.ts`): thin wrapper that starts the Language Client pointing to `dist/server.js`
- **Language Server** (`server/server.ts`): self-contained Node.js process; `@g-casau/rsfc-core` is bundled into `dist/server.js` via `noExternal`
- **TypeScript IntelliSense**: enabled by the `typescriptServerPlugins` contribution which loads `@g-casau/rsfc-typescript-plugin` into tsserver

## Language Server capabilities

- `textDocumentSync: Incremental`
- `diagnostics`: parse errors from `@g-casau/rsfc-core` `parse()`
- `hoverProvider`: block name, kind, lang, attrs
- `documentSymbolProvider`: each block as an outline symbol
- `completionProvider`: block tag names (after `<`) + block attributes

## Grammar embedded languages

| Block | Embedded grammar | VS Code language |
|---|---|---|
| `<template>` | `source.tsx` | `typescriptreact` |
| `<script lang="tsx">` | `source.tsx` | `typescriptreact` |
| `<script>` | `source.ts` | `typescript` |
| `<clientScript>` | `source.ts` | `typescript` |
| `<style lang="scss">` | `source.css.scss` | `scss` |
| `<style lang="less">` | `source.css.less` | `less` |
| `<style>` | `source.css` | `css` |
| `<docs>` | `text.html.markdown` | `markdown` |

## Build

```bash
pnpm --filter ./packages/vscode-extension run build
```

Two entry points produce two CJS bundles. The grammar, snippets, and assets are static files — no build step.

## Packaging for the Marketplace

```bash
# Requires a 128×128 PNG icon at assets/icon.png
# Add "icon": "assets/icon.png" to package.json
pnpm --filter ./packages/vscode-extension run package
# Produces rsfc-<version>.vsix
```

## Rules

- Never add runtime dependencies that aren't bundled into `dist/server.js`
- `vscode-languageserver` and `vscode-languageserver-textdocument` are runtime deps (in node_modules of the VSIX)
- `@g-casau/rsfc-core` must remain bundled (`noExternal` in tsup config)
- Grammar patterns for style blocks must be ordered: scss → less → styl → default CSS
- All coordinates from `@g-casau/rsfc-core` are 0-based; use `doc.positionAt(offset)` for LSP conversion
