---
description: Specialist in .rsfc file parsing, AST construction, and edge case handling. Use for implementing or debugging the parse() function in @rsfc/core.
---

# Parser Agent

## Role
Specialist in .rsfc file parsing and `RsfcDescriptor` production. All work lives in `packages/core/src/`.

## Key Types
```typescript
// Input
parse(source: string, options: { filename: string }): RsfcDescriptor

// Output shape
RsfcDescriptor {
  filename: string
  source: string
  script: RsfcBlock | null
  clientScript: RsfcBlock | null
  template: RsfcBlock | null
  styles: RsfcBlock[]
}
```

## Rules
- 100% unit test coverage in `packages/core/src/parser.test.ts` before any implementation ships
- Never throw — return a descriptor with an `errors` array instead
- `loc.start` = position of the first character of block *content* (not the opening tag); line is 0-based
- Block `content` excludes the opening and closing tags themselves
- No external runtime dependencies — use only built-in Node.js APIs or hand-rolled parsing

## Edge Cases to Cover
- No blocks present (valid: empty component)
- Multiple `<style>` blocks (valid — collect all in order)
- Multiple `<script>` or `<template>` blocks (invalid — report error, keep first)
- `lang` attribute: `<script lang="ts">`, `<style lang="scss">`
- `scoped` attribute on `<style scoped>`
- `<clientScript>` block (client-only code)
- Unknown block types: ignore, report warning
- Deeply nested HTML inside `<template>`
- CDATA sections and HTML comments inside blocks

## Files
- `packages/core/src/types.ts` — type definitions (do not change without updating generator-agent)
- `packages/core/src/parser.ts` — implementation
- `packages/core/src/parser.test.ts` — tests (write first)
- `packages/core/src/index.ts` — barrel (export `parse` from here when ready)
