# RSFC — React Single File Components

Vue-style SFCs, built for React. Co-locate script, template, and styles in a single `.rsfc` file with full TypeScript and CSS Modules support.

```html
<script setup lang="ts">
import { useState } from 'react'

const [count, setCount] = useState(0)
const double = count * 2
</script>

<template>
<div className={styles.card}>
  <p>{count} × 2 = {double}</p>
  <button className={styles.btn} onClick={() => setCount(count + 1)}>
    Increment
  </button>
</div>
</template>

<style module>
.card { padding: 2rem; border-radius: 8px; background: #1b211d; }
.btn  { background: #42b883; color: #003823; border: none; cursor: pointer; }
</style>
```

## Packages

| Package | Description |
|---|---|
| [`@g-casau/rsfc-vite-plugin`](./packages/vite-plugin) | Vite plugin |
| [`@g-casau/rsfc-webpack-loader`](./packages/webpack-loader) | Webpack / Next.js loader |
| [`@g-casau/rsfc-core`](./packages/core) | Parser + generator — zero runtime deps |
| [`@g-casau/rsfc-cli`](./packages/cli) | CLI (`rsfc compile`, `rsfc parse`) |

## Quick Start

### Vite

```bash
npm install -D @g-casau/rsfc-vite-plugin @vitejs/plugin-react
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import rsfc from '@g-casau/rsfc-vite-plugin'

export default defineConfig({ plugins: [rsfc(), react()] })
```

### Next.js

```bash
npm install -D @g-casau/rsfc-webpack-loader
```

```ts
// next.config.ts
const nextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /\.rsfc$/,
      use: [
        { loader: 'babel-loader', options: { presets: [['@babel/preset-react', { runtime: 'automatic' }], '@babel/preset-typescript'] } },
        { loader: '@g-casau/rsfc-webpack-loader' },
      ],
    })
    return config
  },
}
export default nextConfig
```

### TypeScript

Add a declaration file so TypeScript recognises `.rsfc` imports:

```ts
// rsfc.d.ts
declare module '*.rsfc' {
  import type { FC } from 'react'
  const Component: FC
  export default Component
}
```

## Blocks

| Block | Description |
|---|---|
| `<script setup lang="ts">` | Shorthand: imports hoisted, code runs in component scope, default export generated automatically |
| `<script lang="ts">` | Full control — write and export the component function yourself |
| `<template>` | JSX returned by the component. `styles` is in scope automatically when a `<style module>` block is present |
| `<style module>` | CSS Modules — class names are hashed, `styles.*` injected into scope |
| `<style scoped>` | Scoped via a unique `data-v-*` attribute — no class renaming |
| `<style lang="scss">` | Preprocessor support (Sass, Less, Stylus) |
| `<clientScript>` | Browser-only code, skipped during SSR |
| `<docs>` | Embedded Markdown documentation, readable via `parseFile()` |
| `<anything>` | Custom blocks — handle via `customBlockTransforms` in the plugin |

## VS Code Extension

Install the RSFC extension for syntax highlighting, IntelliSense, and CSS Module autocompletion.

**[Download .vsix from GitHub Releases](https://github.com/GeoffreyCasaubon/react-sfc/releases/tag/v0.2.0-vscode)**

Install via _Extensions → Install from VSIX…_ in VS Code.

## Examples

| File | Demonstrates |
|---|---|
| [`Counter.rsfc`](./examples/Counter.rsfc) | `<script setup>`, `<style module>`, `useState` |
| [`TodoList.rsfc`](./examples/TodoList.rsfc) | List rendering, conditional classes, form handling |
| [`UserCard.rsfc`](./examples/UserCard.rsfc) | Explicit `<script>`, `<style scoped>`, props typing, `<docs>` |
| [`ThemeToggle.rsfc`](./examples/ThemeToggle.rsfc) | `<clientScript>` for browser-only side effects |
| [`UserProfile.rsfc`](./examples/UserProfile.rsfc) | Async data, `<graphql>` custom block |

## Development

```bash
pnpm install          # install workspace dependencies
pnpm build            # build all packages
pnpm test             # run tests
pnpm test:coverage    # coverage report
pnpm dev:playground-vite   # http://localhost:5173
pnpm dev:playground-next   # http://localhost:3000
```

Requires Node ≥ 18 and pnpm ≥ 9.

## License

MIT © 2026 Geoffrey Casaubon
