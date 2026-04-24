# RSFC — React Single File Components

A Vue-inspired single-file component format for React. Write `<script>`, `<template>`, and `<style>` in one `.rsfc` file; the toolchain compiles it to plain React.

```html
<script lang="ts">
export const title = "Hello"
</script>

<template>
  <h1>{title}</h1>
</template>

<style>
h1 { color: #0070f3; }
</style>
```

## Packages

| Package | Description |
|---|---|
| [`@rsfc/core`](packages/core) | Parser + code generator, zero runtime deps |
| [`@rsfc/vite-plugin`](packages/vite-plugin) | Vite plugin |
| [`@rsfc/webpack-loader`](packages/webpack-loader) | Webpack loader |
| [`playground-vite`](packages/playground-vite) | Dev playground — Vite + React 19 |
| [`playground-next`](packages/playground-next) | Dev playground — Next.js 15 + React 19 |

## Getting started

```bash
# Install
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type-check all packages
pnpm typecheck
```

### Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import rsfc from "@rsfc/vite-plugin";

export default defineConfig({
  plugins: [rsfc(), react()],
});
```

### Webpack / Next.js

```ts
// next.config.ts
const nextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /\.rsfc$/,
      use: [
        { loader: "babel-loader", options: { presets: [["@babel/preset-react", { runtime: "automatic" }], "@babel/preset-typescript"] } },
        { loader: "@rsfc/webpack-loader" },
      ],
    });
    return config;
  },
};
export default nextConfig;
```

## Block reference

| Block | Required | Notes |
|---|---|---|
| `<script>` | no | Module-level code, exports, loaders |
| `<script setup>` | no | Component setup — top-level vars available in template; `import` statements hoisted |
| `<clientScript>` | no | Client-only side-effect code |
| `<template>` | no | JSX, compiled to `export default function` |
| `<style>` | no | Multiple blocks; `lang="scss"` / `lang="sass"`; `scoped` attribute |

`<script>`, `<script setup>`, and `<template>` accept `lang="ts"` for TypeScript.

### `<script setup>` example

```html
<script setup lang="ts">
import { useState } from "react"

const title = "Hello"          <!-- no export needed -->
const [count, setCount] = useState(0)
</script>

<template>
  <div>
    <h1>{title}</h1>
    <button onClick={() => setCount(count + 1)}>{count}</button>
  </div>
</template>
```

`<style scoped>` generates a unique `data-v-*` attribute and stamps every DOM element in the template and every CSS selector with it — styles stay component-local.

```html
<style lang="scss" scoped>
.card {
  border: 1px solid #ccc;

  h2 { color: #111; }   /* compiles to .card[data-v-xxx] h2[data-v-xxx] */
}
</style>
```

## Development

```bash
pnpm dev:playground-vite    # http://localhost:5173
pnpm dev:playground-next    # http://localhost:3000
pnpm test:watch             # Vitest in watch mode
pnpm test:coverage          # Coverage report
```

## Requirements

- Node ≥ 18
- pnpm ≥ 9
