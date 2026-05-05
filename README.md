# RSFC — React Single File Components

**Write React components the way Vue writers always dreamed of.**

RSFC lets you co-locate script, template, styles, documentation, and custom
blocks inside a single `.rsfc` file — with full TypeScript, source maps, CSS
Modules, scoped styles, and preprocessor support out of the box.

```html
<script setup lang="ts">
import { useState } from "react"

const [count, setCount] = useState(0)
</script>

<template>
<button className={styles.btn} onClick={() => setCount(count + 1)}>
  Clicked {count} times
</button>
</template>

<style module>
.btn {
  padding: 0.5rem 1rem;
  background: #646cff;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.btn:hover { background: #535bf2; }
</style>
```

---

## Packages

| Package | Description |
|---------|-------------|
| [`@g-casau/rsfc-core`](#rsfc-core) | Parser + code generator — zero runtime deps |
| [`@g-casau/rsfc-vite-plugin`](#vite) | Vite plugin |
| [`@g-casau/rsfc-webpack-loader`](#webpack--nextjs) | Webpack loader |
| [`@g-casau/rsfc-cli`](#cli) | CLI tool (`rsfc compile`, `rsfc parse`) |

---

## Features

- **`<script setup>`** — import hoisting, no boilerplate component wrapper
- **`<template>`** — JSX written at the top level, returned automatically
- **`<style module>`** — CSS Modules with hashed class names, `styles.*` in scope automatically
- **`<style scoped>`** — isolation via a generated JSX factory, no class renaming
- **CSS preprocessors** — Sass, Less, Stylus with graceful fallback
- **`<docs>` block** — embedded Markdown docs, available via `parseFile()`
- **Custom blocks** — extend with `<graphql>`, `<i18n>`, or any tag
- **`<clientScript>`** — browser-only code (skipped during SSR)
- **V3 source maps** — column-accurate, always emitted
- **TypeScript strict** — the entire toolchain is typed with zero `any`
- **Zero runtime in core** — `@g-casau/rsfc-core` has no dependencies at all

---

## Quick Start

### Vite

```bash
pnpm add -D @g-casau/rsfc-vite-plugin @vitejs/plugin-react
```

```ts
// vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import rsfc from "@g-casau/rsfc-vite-plugin"

export default defineConfig({
  plugins: [rsfc(), react()],
})
```

Add a type declaration so TypeScript knows `.rsfc` files export a React component:

```ts
// src/rsfc.d.ts
declare module "*.rsfc" {
  import type { FC } from "react"
  const Component: FC
  export default Component
}
```

### Webpack / Next.js

```bash
pnpm add -D @g-casau/rsfc-webpack-loader
```

```ts
// next.config.ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /\.rsfc$/,
      use: [
        {
          loader: "babel-loader",
          options: {
            presets: [
              ["@babel/preset-react", { runtime: "automatic" }],
              "@babel/preset-typescript",
            ],
          },
        },
        { loader: "@g-casau/rsfc-webpack-loader" },
      ],
    })
    return config
  },
}

export default nextConfig
```

> **Note:** Webpack processes loaders right-to-left. `@g-casau/rsfc-webpack-loader` runs
> first (compiles `.rsfc` → JSX/TS), then `babel-loader` strips types and JSX.

---

## Block Reference

| Block | Variants | Description |
|-------|----------|-------------|
| `<script>` | `lang="ts"` | Module-level code; write and export your component function |
| `<script setup>` | `lang="ts"` | Shorthand: imports hoisted, code runs in component scope |
| `<template>` | | JSX returned by the component |
| `<style>` | `module`, `scoped`, `lang="scss\|sass\|less\|styl"` | Component styles |
| `<clientScript>` | | Browser-only code (skipped during SSR) |
| `<docs>` | | Embedded Markdown documentation |
| `<anything>` | | Custom blocks — processed via `customBlockTransforms` |

---

## Script Blocks

### `<script>` — full control

Use when you need explicit control over the component signature (props typing,
ref forwarding, display name…).

```html
<script lang="ts">
export interface CardProps {
  title: string
  children: React.ReactNode
}

export default function Card({ title, children }: CardProps) {
  return (
    <article>
      <h2>{title}</h2>
      {children}
    </article>
  )
}
</script>
```

### `<script setup>` — shorthand sugar

Imports are hoisted to the module scope. Everything else runs inside the
component function. A default export wrapping those statements is generated
automatically.

```html
<script setup lang="ts">
import { useState, useCallback } from "react"

const [value, setValue] = useState("")
const clear = useCallback(() => setValue(""), [])
</script>

<template>
<div>
  <input value={value} onChange={(e) => setValue(e.target.value)} />
  <button onClick={clear}>Clear</button>
</div>
</template>
```

---

## Template

The `<template>` block is the JSX returned by the component. Single root
element, full JSX syntax.

```html
<template>
<ul>
  {items.map((item) => (
    <li key={item.id}>{item.label}</li>
  ))}
</ul>
</template>
```

When a `<style module>` block is present, a `styles` object is automatically
in scope — no import needed:

```html
<template>
<div className={styles.container}>
  <p className={styles.text}>Hello</p>
</div>
</template>
```

---

## Styles

### Plain styles

```html
<style>
.button { background: #2563eb; color: #fff; border-radius: 6px; }
</style>
```

### CSS Modules — `<style module>`

Class names are hashed at build time. The `styles` object is injected into
the component scope automatically.

```html
<template>
<button className={styles.btn}>Click me</button>
</template>

<style module>
.btn {
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
}
</style>
```

Name the styles variable by passing a value to `module`:

```html
<style module="css">
.btn { /* … */ }
</style>

<template>
<button className={css.btn}>Click me</button>
</template>
```

### Scoped styles — `<style scoped>`

A unique `data-v-xxxxxxxx` attribute is added to every element rendered by
the component. CSS selectors are rewritten to match only those elements — no
class renaming, no runtime overhead.

```html
<style scoped>
/* Only targets <p> elements inside this component */
p { color: #374151; line-height: 1.6; }
.title { font-size: 1.5rem; font-weight: 700; }
</style>
```

### Preprocessors

Install the peer package and set `lang`:

```html
<style lang="scss" module>
$primary: #2563eb;

.btn {
  background: $primary;
  &:hover { background: darken($primary, 10%); }
}
</style>
```

| Preprocessor | `lang` value | Peer package |
|---|---|---|
| Sass / SCSS | `scss` or `sass` | `pnpm add -D sass` |
| Less | `less` | `pnpm add -D less` |
| Stylus | `styl` or `stylus` | `pnpm add -D stylus` |

Missing peer packages fall back to the raw source gracefully.

---

## Client-only Code — `<clientScript>`

Code in `<clientScript>` is placed inside the component function body but
guarded by `typeof document !== "undefined"` — it runs in the browser and
is skipped during SSR.

```html
<script setup lang="ts">
import { useState } from "react"

const [theme, setTheme] = useState<"light" | "dark">("light")
</script>

<clientScript>
// Sync theme to <html data-theme="…"> — browser only
document.documentElement.setAttribute("data-theme", theme)
</clientScript>

<template>
<button onClick={() => setTheme((t) => t === "light" ? "dark" : "light")}>
  Toggle theme
</button>
</template>
```

---

## Documentation Block — `<docs>`

Embed Markdown documentation directly in the component file. Tooling
(editors, Storybook plugins, doc generators) can read it via `parseFile()`.

```html
<docs>
# Button

A polymorphic button with primary and ghost variants.

## Props

| Prop     | Type                      | Default   |
|----------|---------------------------|-----------|
| variant  | `"primary" \| "ghost"`   | `primary` |
| disabled | `boolean`                 | `false`   |
</docs>
```

Extract it programmatically:

```ts
import { parseFile } from "@g-casau/rsfc-cli"

const { docs } = parseFile("./src/Button.rsfc")
console.log(docs?.content)  // Markdown string
```

---

## Custom Blocks

Any unrecognised tag becomes a `CustomBlock`. Wire up transforms in the
Vite plugin via `customBlockTransforms`:

```ts
// vite.config.ts
import rsfc from "@g-casau/rsfc-vite-plugin"

export default {
  plugins: [
    rsfc({
      customBlockTransforms: {
        // Export a typed GraphQL document string
        graphql: (block) =>
          `export const QUERY = \`${block.content.trim()}\``,

        // Inline i18n messages as a typed object
        i18n: (block) =>
          `export const messages = ${block.content}`,
      },
    }),
  ],
}
```

The transform return value is appended to the generated code before TypeScript
stripping — so you can return typed TypeScript from transforms too.

```html
<graphql>
query GetUser($id: ID!) {
  user(id: $id) { id name email }
}
</graphql>

<i18n>
{ "save": "Save", "cancel": "Cancel" }
</i18n>
```

---

## CLI

```bash
pnpm add -g @g-casau/rsfc-cli
```

### `rsfc compile`

Compile a `.rsfc` file to standalone JavaScript. CSS is inlined as a
DOM-injection IIFE — no bundler required.

```bash
rsfc compile src/Button.rsfc               # output to stdout
rsfc compile src/Button.rsfc -o dist/Button.js
```

### `rsfc parse`

Parse a `.rsfc` file and print the descriptor as JSON. Pipe to `jq` for
targeted extraction.

```bash
rsfc parse src/Button.rsfc                 # full descriptor
rsfc parse src/Button.rsfc | jq '.docs'    # docs content
rsfc parse src/Button.rsfc | jq '[.styles[].attrs]'
```

---

## Examples

The [`examples/`](./examples) directory contains ready-to-read components:

| File | What it demonstrates |
|------|----------------------|
| [`Counter.rsfc`](./examples/Counter.rsfc) | `<script setup>`, `<style module>`, `useState` |
| [`TodoList.rsfc`](./examples/TodoList.rsfc) | List rendering, conditional classes, form handling |
| [`UserCard.rsfc`](./examples/UserCard.rsfc) | `<script>` (explicit), `<style scoped>`, props type, `<docs>` |
| [`ThemeToggle.rsfc`](./examples/ThemeToggle.rsfc) | `<clientScript>` for browser-only DOM side-effects |
| [`UserProfile.rsfc`](./examples/UserProfile.rsfc) | Async fetch, `<graphql>` custom block |

---

## API Reference

### `@g-casau/rsfc-core`

```ts
import { parse, generate, scopeCss } from "@g-casau/rsfc-core"
import type {
  RsfcDescriptor, RsfcBlock, StyleBlock, CustomBlock,
  GeneratedOutput, VirtualModule, RawSourceMap,
} from "@g-casau/rsfc-core"
```

#### `parse(source, options): RsfcDescriptor`

```ts
const descriptor = parse(source, { filename: "/abs/path/Component.rsfc" })

descriptor.script        // <script> block | null
descriptor.scriptSetup   // <script setup> block | null
descriptor.clientScript  // <clientScript> block | null
descriptor.template      // <template> block | null
descriptor.styles        // StyleBlock[]
descriptor.docs          // <docs> block | null
descriptor.customBlocks  // CustomBlock[]
descriptor.errors        // RsfcParseError[]
```

#### `generate(descriptor): GeneratedOutput`

```ts
const { code, map, virtualModules } = generate(descriptor)
// code            — compiled JavaScript (imports + JSX, no TS stripping)
// map             — V3 source map (always present)
// virtualModules  — style virtual modules for Vite's module graph
```

#### `VirtualModule`

```ts
interface VirtualModule {
  id: string                        // "\0rsfc:style:/path.rsfc:0.css"
  code: string                      // CSS source
  classMap?: Record<string, string> // CSS Modules hashed names
  moduleVar?: string                // import variable for CSS module
}
```

### `@g-casau/rsfc-vite-plugin` options

```ts
interface RsfcPluginOptions {
  include?: string[]   // default ["**/*.rsfc"]
  exclude?: string[]   // default ["node_modules/**"]
  customBlockTransforms?: {
    [tag: string]: (block: CustomBlock, id: string) => string | null | undefined
  }
}
```

### `@g-casau/rsfc-cli` — programmatic API

```ts
import { compileFile, parseFile } from "@g-casau/rsfc-cli"

const js = await compileFile("./src/Button.rsfc")   // → JS string
const descriptor = parseFile("./src/Button.rsfc")   // → RsfcDescriptor
```

---

## Repository Structure

```
react-sfc/
├── examples/             Annotated example .rsfc components
├── packages/
│   ├── core/             @g-casau/rsfc-core      — parser + generator, zero deps
│   ├── vite-plugin/      @g-casau/rsfc-vite-plugin
│   ├── webpack-loader/   @g-casau/rsfc-webpack-loader
│   ├── cli/              @g-casau/rsfc-cli
│   ├── playground-vite/  Vite + React 19 integration sandbox
│   └── playground-next/  Next.js 15 + React 19 integration sandbox
└── vitest.workspace.ts
```

## Development

```bash
pnpm install          # install all workspace dependencies

pnpm build            # build all packages (core → plugins → cli)
pnpm test             # run the full test suite
pnpm test:watch       # vitest in watch mode
pnpm test:coverage    # coverage report

pnpm dev:playground-vite    # http://localhost:5173
pnpm dev:playground-next    # http://localhost:3000

pnpm typecheck        # tsc --noEmit across all packages
```

## Requirements

- Node ≥ 18
- pnpm ≥ 9

---

## License

MIT © 2026 Geoffrey Casaubon
