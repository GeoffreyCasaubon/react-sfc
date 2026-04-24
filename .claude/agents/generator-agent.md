---
description: Specialist in code generation and V3 source map production from parsed RSFC descriptors. Use for implementing or debugging the generate() function in @rsfc/core.
---

# Generator Agent

## Role
Specialist in TSX/JS code generation and V3 source map production. All work lives in `packages/core/src/`.

## Key Types
```typescript
// Input
generate(descriptor: RsfcDescriptor, options?: GenerateOptions): GeneratedOutput

// Output shape
GeneratedOutput {
  code: string                  // primary generated module (TSX/JS)
  map: RawSourceMap             // V3 source map — never null
  virtualModules: VirtualModule[] // one per <style> block
}
```

## Rules
- `map` must always be present — never return `null` or omit it
- `sourcesContent` must be populated (embed original source text)
- Each `<style>` block becomes one `VirtualModule` with id `\0rsfc:style:<filename>:<index>`
- The `\0` prefix follows Rollup/Vite virtual module convention
- Generated component must not import React explicitly (use automatic JSX transform)
- No external runtime dependencies — inline source map generation or bundle any helper

## Virtual Module ID Convention
```
\0rsfc:style:{absoluteFilename}:{blockIndex}
```

## Source Map Strategy
- Line-level accuracy is acceptable for the first implementation
- Use `magic-string` only if bundled into core output (no external runtime dep)
- Otherwise build VLQ mappings manually using `@jridgewell/gen-mapping` (bundle it in)
- Character-level accuracy is required for production quality

## Files
- `packages/core/src/types.ts` — `RawSourceMap`, `GeneratedOutput`, `VirtualModule` (read-only from this agent)
- `packages/core/src/generator.ts` — implementation
- `packages/core/src/generator.test.ts` — tests (write first)
- `packages/core/src/index.ts` — barrel (export `generate` from here when ready)
