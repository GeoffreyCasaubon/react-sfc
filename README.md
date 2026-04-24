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
| `<script>` | no | Module-level code, exports, server logic |
| `<clientScript>` | no | Client-only code (not SSR) |
| `<template>` | no | JSX, compiled to `export default function` |
| `<style>` | no | Scoped CSS; multiple blocks allowed |

Both `<script>` and `<template>` accept a `lang="ts"` attribute for TypeScript.

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
