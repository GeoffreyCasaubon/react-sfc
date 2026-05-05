# @g-casau/rsfc-vite-plugin

Vite plugin for React Single File Components (`.rsfc`).

## Installation

```bash
npm install -D @g-casau/rsfc-vite-plugin
```

## Setup

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import rsfc from "@g-casau/rsfc-vite-plugin";

export default defineConfig({
  plugins: [rsfc(), react()],
});
```

## Usage

Create `.rsfc` files in your project:

```html
<!-- src/components/Counter.rsfc -->
<script setup>
import { useState } from "react";

const [count, setCount] = useState(0);
</script>

<template>
<div className={styles.wrapper}>
  <p>Count: {count}</p>
  <button onClick={() => setCount(c => c + 1)}>Increment</button>
</div>
</template>

<style module>
.wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
```

Then import like any regular component:

```tsx
import Counter from "./components/Counter.rsfc";

export default function App() {
  return <Counter />;
}
```

## Options

```ts
rsfc({
  // Glob patterns to include. Default: ["**/*.rsfc"]
  include: ["**/*.rsfc"],

  // Glob patterns to exclude. Default: ["node_modules/**"]
  exclude: ["node_modules/**"],

  // Transform custom block tags to JS output
  customBlockTransforms: {
    graphql: (block) => `export const QUERY = \`${block.content}\`;`,
    i18n: (block) => `export const messages = ${block.content};`,
  },
})
```

## CSS preprocessors

Install the peer dependency for the preprocessor you need:

```bash
npm install -D sass      # <style lang="scss"> or <style lang="sass">
npm install -D less      # <style lang="less">
npm install -D stylus    # <style lang="stylus">
```

## HMR

The plugin supports fine-grained HMR:
- **Style-only changes** — hot-swaps CSS without re-rendering the component
- **Script or template changes** — triggers a full component reload

## License

MIT
