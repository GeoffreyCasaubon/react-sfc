# @g-casau/rsfc-core

Zero-dependency parser and code generator for React Single File Components (`.rsfc`).

This is the foundation package consumed by `@g-casau/rsfc-vite-plugin`, `@g-casau/rsfc-webpack-loader`, and `@g-casau/rsfc-cli`. You only need this directly if you're building a custom integration.

## Installation

```bash
npm install @g-casau/rsfc-core
```

## What is an `.rsfc` file?

A React Single File Component combines script, template, and styles in one file — similar to Vue SFCs.

```html
<script setup>
import { useState } from "react";

const [count, setCount] = useState(0);
</script>

<template>
<div className={styles.container}>
  <p>Count: {count}</p>
  <button onClick={() => setCount(c => c + 1)}>+</button>
</div>
</template>

<style module>
.container { padding: 1rem; }
</style>
```

## API

### `parse(source, options)`

Parses an `.rsfc` file and returns an `RsfcDescriptor`.

```ts
import { parse } from "@g-casau/rsfc-core";

const descriptor = parse(source, { filename: "App.rsfc" });
// descriptor.scriptSetup?.content
// descriptor.template?.content
// descriptor.styles[]
// descriptor.errors[]
```

### `generate(descriptor)`

Generates a JavaScript module from a parsed descriptor.

```ts
import { parse, generate } from "@g-casau/rsfc-core";

const descriptor = parse(source, { filename: "App.rsfc" });
const output = generate(descriptor);
// output.code          — JS string to emit
// output.map           — V3 source map
// output.virtualModules — style virtual modules for the bundler to resolve
```

### `compileCss(virtualModule)`

Compiles a style virtual module using the appropriate preprocessor (`sass`, `less`, or `stylus`) based on its file extension. Returns raw CSS for plain `.css` modules. Throws a descriptive error if the required preprocessor is not installed.

```ts
import { compileCss } from "@g-casau/rsfc-core";

const css = await compileCss(vm); // vm is a VirtualModule from generate()
```

### `buildStyleIIFE(css, index)`

Wraps compiled CSS in an SSR-safe IIFE that appends a `<style>` tag to the DOM. Used by webpack and CLI integrations where Vite's virtual module pipeline is unavailable.

```ts
import { buildStyleIIFE } from "@g-casau/rsfc-core";

const iife = buildStyleIIFE(".btn { color: red }", 0);
```

## Supported block types

| Block | Description |
|---|---|
| `<script>` | Module-level code (exports, loaders) |
| `<script setup>` | Component setup — imports are hoisted, rest goes into the component function |
| `<template>` | JSX template |
| `<style>` | Plain CSS |
| `<style module>` | CSS Modules — exports a scoped class map |
| `<style lang="scss\|sass\|less\|stylus">` | CSS preprocessors (requires peer dep) |
| `<docs>` | Documentation block — parsed but not emitted |

## Types

```ts
import type {
  RsfcDescriptor,
  RsfcBlock,
  StyleBlock,
  CustomBlock,
  GeneratedOutput,
  VirtualModule,
  RsfcParseError,
} from "@g-casau/rsfc-core";
```

## License

MIT
