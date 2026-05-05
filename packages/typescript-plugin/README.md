# @g-casau/rsfc-typescript-plugin

TypeScript language service plugin for `.rsfc` files. Enables accurate prop types, go-to-definition, and IntelliSense in any IDE that uses `tsserver` (VS Code, WebStorm, Neovim, etc.).

## Installation

```bash
npm install -D @g-casau/rsfc-typescript-plugin
```

## Setup

Add the plugin to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "name": "@g-casau/rsfc-typescript-plugin" }
    ]
  }
}
```

> **VS Code**: TypeScript language features run in a separate process. You need to select **"Use Workspace Version"** of TypeScript for plugins to activate:
> 1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
> 2. Run **TypeScript: Select TypeScript Version**
> 3. Choose **Use Workspace Version**

## How it works

When TypeScript resolves an import like:

```ts
import Counter from "./Counter.rsfc";
```

The plugin intercepts it and generates a virtual `.rsfc.__rsfc__.tsx` file from the `<script>` / `<script setup>` block. TypeScript type-checks against this virtual file, so the imported component has accurate types — including props, return type, and exported symbols.

## What you get

- **Prop inference** — TypeScript knows what props each `.rsfc` component accepts
- **Go-to-definition** — jump from an import to the component's script block
- **IntelliSense** — autocomplete on component props and exported values
- **Type errors** — caught at compile time, not at runtime

## License

MIT
