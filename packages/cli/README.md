# @g-casau/rsfc-cli

CLI for React Single File Components — compile `.rsfc` files to standalone JavaScript or inspect their parsed structure.

## Installation

```bash
npm install -g @g-casau/rsfc-cli
# or use without installing:
npx @g-casau/rsfc-cli <command>
```

## Commands

### `rsfc compile`

Compiles an `.rsfc` file to a standalone JavaScript module. Styles are inlined as DOM-injection IIFEs (SSR-safe).

```bash
rsfc compile src/App.rsfc
rsfc compile src/App.rsfc -o dist/App.js
```

CSS preprocessors (`sass`, `less`, `stylus`) are used automatically when installed. If a preprocessor is missing, the raw source is injected as-is.

### `rsfc parse`

Parses an `.rsfc` file and prints the descriptor as JSON. Useful for debugging, tooling, or documentation pipelines.

```bash
rsfc parse src/App.rsfc
rsfc parse src/App.rsfc | jq '.styles'
rsfc parse src/App.rsfc -o descriptor.json
```

## Options

| Option | Description |
|---|---|
| `-o, --out <file>` | Write output to a file instead of stdout |
| `--version` | Print the version number |
| `--help` | Print help |

## Examples

```bash
# Compile and pipe into a bundler
rsfc compile src/Widget.rsfc | esbuild --bundle --outfile=dist/widget.js

# Inspect all style blocks
rsfc parse src/App.rsfc | jq '.styles[].content'

# Batch compile
for f in src/components/*.rsfc; do
  rsfc compile "$f" -o "dist/$(basename "$f" .rsfc).js"
done
```

## Programmatic API

The CLI also exports a programmatic API:

```ts
import { compileFile, parseFile } from "@g-casau/rsfc-cli";

// Compile to JS string
const js = await compileFile("src/App.rsfc");

// Get the parsed descriptor
const descriptor = parseFile("src/App.rsfc");
```

## License

MIT
