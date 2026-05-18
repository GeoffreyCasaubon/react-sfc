# RSFC — VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/g-casau.rsfc.svg?label=VS%20Code%20Marketplace&color=0ea5e9)](https://marketplace.visualstudio.com/items?itemName=g-casau.rsfc)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/GeoffreyCasaubon/react-sfc/blob/main/LICENSE)

Full-featured VS Code support for `.rsfc` (React Single File Components) — syntax highlighting with embedded languages, live diagnostics, TypeScript IntelliSense, block folding, snippets, and more.

---

## Features

### Syntax Highlighting

Each RSFC block embeds the correct language grammar, giving you accurate highlighting and IntelliSense everywhere:

| Block | Embedded language | Notes |
|---|---|---|
| `<script>` / `<script setup>` | TypeScript | Full TS grammar |
| `<script lang="tsx">` | TypeScript React | JSX highlighting |
| `<clientScript>` | TypeScript | Browser-only guard |
| `<template>` | TypeScript React | JSX template |
| `<style>` | CSS | Plain CSS |
| `<style lang="scss">` | SCSS | Requires `sass` |
| `<style lang="less">` | Less | Requires `less` |
| `<docs>` | Markdown | Documentation block |

### Language Server (LSP)

The extension ships a dedicated language server that provides:

- **Live Diagnostics** — parse errors from the RSFC compiler are shown inline as you type, before any build step
- **Document Outline** — all blocks (`script`, `template`, `style`, etc.) appear in the Explorer outline panel for quick navigation
- **Block Folding** — each block can be independently folded
- **Hover Documentation** — hover over any block to see its kind, language, and declared attributes
- **Smart Completion** — type `<` at the start of a line to get block tag completions with auto-closing tags; inside an opening tag, attributes like `scoped`, `module`, and `lang="scss"` are suggested

### TypeScript IntelliSense

The extension configures VS Code to load `@g-casau/rsfc-typescript-plugin` into tsserver. This gives you:

- Full type checking for `.rsfc` imports (`import Button from './Button.rsfc'`)
- Correct prop types when using imported components
- Go-to-definition and find-references for component exports

> **Requires** `@g-casau/rsfc-typescript-plugin` to be installed in your project. See [TypeScript Setup](#typescript-intellisense-setup).

### Snippets

| Prefix | Block |
|---|---|
| `rsfc` | Full component (script setup + template + style) |
| `rsfc-props` | Component with typed props interface |
| `script` | `<script>` block |
| `script-setup` | `<script setup>` block |
| `template` | `<template>` block |
| `style` | `<style>` block |
| `style-scoped` | `<style scoped>` block |
| `style-module` | `<style module>` block |
| `style-scss` | `<style lang="scss">` block |
| `clientScript` | `<clientScript>` block |
| `docs` | `<docs>` Markdown block |

---

## Installation

### From the VS Code Marketplace

Search for **RSFC** in the Extensions panel, or open the Quick Open menu (`Ctrl+P` / `Cmd+P`) and run:

```
ext install g-casau.rsfc
```

### From a VSIX file

Download `rsfc-*.vsix` from the [Releases page](https://github.com/GeoffreyCasaubon/react-sfc/releases) and install it:

```bash
code --install-extension rsfc-*.vsix
```

---

## Requirements

- **VS Code** `1.85.0` or later
- **Node.js** `18` or later (for the language server)
- **TypeScript IntelliSense** requires `@g-casau/rsfc-typescript-plugin` in your project

---

## TypeScript IntelliSense Setup

Install the TypeScript plugin in your project:

```bash
npm install -D @g-casau/rsfc-typescript-plugin
# or
pnpm add -D @g-casau/rsfc-typescript-plugin
```

The VS Code extension automatically instructs tsserver to load this plugin — no `tsconfig.json` changes needed. You may need to run **TypeScript: Restart TS Server** from the command palette once after installation.

### Type declarations

Add an `rsfc.d.ts` file to your project root so TypeScript understands `.rsfc` imports:

```ts
declare module '*.rsfc' {
  import type { FC } from 'react'
  const Component: FC
  export default Component
}
```

---

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `rsfc.trace.server` | `"off" \| "messages" \| "verbose"` | `"off"` | Traces the communication between VS Code and the RSFC language server. Useful for debugging. |

---

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for **RSFC**:

| Command | Description |
|---|---|
| `RSFC: Restart Language Server` | Restarts the language server process. Use this if diagnostics stop updating or the server becomes unresponsive. |

---

## Building from Source

```bash
git clone https://github.com/GeoffreyCasaubon/react-sfc.git
cd react-sfc
pnpm install

# Build the core parser (required dependency)
pnpm build:core

# Build the extension
pnpm build:extension

# Package as .vsix
cd packages/vscode-extension
pnpm package
```

---

## Publishing to the Marketplace

Before your first publish:

1. Create a **128×128 PNG icon** at `packages/vscode-extension/assets/icon.png`
2. Add `"icon": "assets/icon.png"` to `packages/vscode-extension/package.json`
3. Register as publisher **`g-casau`** at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
4. Create a Personal Access Token (PAT) in Azure DevOps with **Marketplace → Publish** scope
5. Publish via the GitHub Actions workflow (set `VSCE_PAT` secret in repo settings) or manually:

```bash
cd packages/vscode-extension
pnpm publish:marketplace
```

---

## License

MIT — [Geoffrey Casaubon](https://github.com/GeoffreyCasaubon)
