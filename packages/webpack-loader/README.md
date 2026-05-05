# @g-casau/rsfc-webpack-loader

Webpack loader for React Single File Components (`.rsfc`).

Works with Webpack 5 and Next.js.

## Installation

```bash
npm install -D @g-casau/rsfc-webpack-loader
```

## Setup

### Webpack

```js
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.rsfc$/,
        use: ["babel-loader", "@g-casau/rsfc-webpack-loader"],
      },
    ],
  },
};
```

### Next.js

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /\.rsfc$/,
      use: [
        { loader: "next-swc-loader" },
        { loader: "@g-casau/rsfc-webpack-loader" },
      ],
    });
    return config;
  },
};

export default nextConfig;
```

## Usage

```html
<!-- src/components/Button.rsfc -->
<script setup>
const { label, onClick } = props;
</script>

<template>
<button className={styles.btn} onClick={onClick}>
  {label}
</button>
</template>

<style module>
.btn {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}
</style>
```

```tsx
import Button from "./components/Button.rsfc";

export default function Page() {
  return <Button label="Click me" onClick={() => alert("clicked")} />;
}
```

## CSS preprocessors

Install the peer dependency for the preprocessor you need:

```bash
npm install -D sass      # <style lang="scss"> or <style lang="sass">
npm install -D less      # <style lang="less">
npm install -D stylus    # <style lang="stylus">
```

Style blocks are compiled and injected at runtime via an SSR-safe IIFE. The injection is skipped server-side (`typeof document !== 'undefined'` guard).

## License

MIT
