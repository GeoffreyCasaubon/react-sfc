## 🚀 React Single File Components — v1.0.0

First stable release of the RSFC ecosystem — Vue-style Single File Components for React, with full TypeScript support.

---

### Packages

| Package | Version | Description |
|---|---|---|
| `@rsfc/core` | 1.0.0 | Parser + generator, zero runtime deps |
| `@rsfc/vite-plugin` | 1.0.0 | Vite 5+ integration |
| `@rsfc/webpack-loader` | 1.0.0 | Webpack 5+ / Next.js 15 integration |
| `@rsfc/cli` | 1.0.0 | CLI — `rsfc compile` and `rsfc parse` |
| `@rsfc/typescript-plugin` | 1.0.0 | TypeScript Language Service Plugin |

---

### What is RSFC?

An `.rsfc` file co-locates your component logic, template and styles in a single file:

```html
<script setup lang="ts">
import { useState } from "react"

const { label } = defineProps<{ label: string }>()
const [count, setCount] = useState(0)
</script>

<template>
  <button className={styles.btn} onClick={() => setCount(c => c + 1)}>
    {label}: {count}
  </button>
</template>

<style module>
.btn { background: #3b82f6; color: #fff; padding: 0.4em 1em; border-radius: 6px; }
</style>
```

---

### Features

**Parser (`@rsfc/core`)**
- Blocks: `<script>`, `<script setup>`, `<template>`, `<style>`, `<clientScript>`, `<docs>`, custom blocks
- `defineProps<T>()` macro — single and multi-line generic type arguments
- CSS Modules (`<style module>`), scoped CSS (`<style scoped>`), preprocessors (Sass/Less/Stylus)
- V3 source maps on every transform

**Vite Plugin (`@rsfc/vite-plugin`)**
- Smart HMR: style-only changes trigger a targeted CSS hot-update, no full component reload
- Custom block transforms via `customBlockTransforms` option
- Parse errors surfaced as Vite warnings, never throws

**Webpack Loader (`@rsfc/webpack-loader`)**
- Webpack 5+ and Next.js 15 (App Router) compatible
- Inline CSS module class maps

**CLI (`@rsfc/cli`)**
- `rsfc compile <file>` — outputs standalone JavaScript (esbuild, JSX + TS stripped)
- `rsfc parse <file>` — prints the parsed `RsfcDescriptor` as JSON

**TypeScript Plugin (`@rsfc/typescript-plugin`)**
- tsserver Language Service Plugin
- Prop inference from `defineProps<T>()` and `interface Props`
- Works in VS Code, WebStorm, and any tsserver-based IDE

**SSR safe**
- `<clientScript>` blocks guarded by `typeof document !== 'undefined'`
- Tested with Next.js 15 App Router (server + client components)

---

### Quick Start

```bash
# Vite
pnpm add -D @rsfc/vite-plugin

# Webpack / Next.js
pnpm add -D @rsfc/webpack-loader

# CLI
pnpm add -g @rsfc/cli
```
