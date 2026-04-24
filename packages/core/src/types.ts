/**
 * RSFC (React Single File Component) core type definitions.
 *
 * Pipeline:
 *   1. Parsing  → RsfcDescriptor  (what was found in the .rsfc file)
 *   2. Codegen  → GeneratedOutput (what the bundler plugin emits)
 *
 * Naming conventions (from CLAUDE.md):
 *   - Parser    → produces RsfcDescriptor
 *   - Generator → produces GeneratedOutput { code, map, virtualModules }
 *   - Blocks    : script | clientScript | template | styles[]
 */

// ---------------------------------------------------------------------------
// Location types — shared by parser and generator for source mapping
// ---------------------------------------------------------------------------

export interface SourcePosition {
  /** 0-based line number within the source file. */
  line: number;
  /** 0-based column number within the line. */
  column: number;
  /** 0-based byte offset from the start of the source file. */
  offset: number;
}

/** Spans a range in the source file, from `start` (inclusive) to `end` (exclusive). */
export interface SourceLocation {
  start: SourcePosition;
  end: SourcePosition;
}

// ---------------------------------------------------------------------------
// Descriptor types — produced by the parser
// ---------------------------------------------------------------------------

export type RsfcBlockKind = "script" | "clientScript" | "template" | "style";

export interface RsfcBlock {
  kind: RsfcBlockKind;
  /** Raw source text of the block content (excluding the wrapping tags). */
  content: string;
  /** Language attribute value, e.g. "tsx", "scss". Undefined when absent. */
  lang?: string | undefined;
  /** Source location of the block content (not including the opening/closing tags). */
  loc: SourceLocation;
  /** Attributes declared on the opening tag, excluding `lang`. */
  attrs: Record<string, string | true>;
}

/** A `<style>` block — carries the same shape as RsfcBlock but its kind is always "style". */
export type StyleBlock = RsfcBlock & { kind: "style" };

export interface RsfcParseError {
  message: string;
  /** Source location of the offending opening tag. */
  loc: SourceLocation;
}

export interface RsfcDescriptor {
  filename: string;
  source: string;
  /** <script> — module-level code (exports, loaders, etc.) */
  script: RsfcBlock | null;
  /**
   * <script setup> — component setup code.
   * `import` statements are hoisted to module level; everything else is
   * placed inside the component function before the template return.
   */
  scriptSetup: RsfcBlock | null;
  clientScript: RsfcBlock | null;
  template: RsfcBlock | null;
  /** Zero or more style blocks, in source order. */
  styles: StyleBlock[];
  errors: RsfcParseError[];
}

// ---------------------------------------------------------------------------
// Generator types — produced by the code generator
// ---------------------------------------------------------------------------

/**
 * Raw source map structure (V3 spec subset).
 * Inlined to preserve the zero-external-deps constraint.
 */
export interface RawSourceMap {
  version: 3;
  file?: string | undefined;
  sourceRoot?: string | undefined;
  sources: string[];
  sourcesContent?: Array<string | null> | undefined;
  names: string[];
  mappings: string;
}

export interface VirtualModule {
  /** Virtual module id intercepted by the bundler plugin. */
  id: string;
  code: string;
  map?: string | RawSourceMap | undefined;
}

export interface GeneratedOutput {
  code: string;
  /** Source map — always present, never omit. */
  map: RawSourceMap;
  /**
   * Additional virtual modules for style blocks.
   * Bundler plugins must register resolution hooks for each entry.
   * Virtual module id convention: `\0rsfc:style:<absoluteFilename>:<blockIndex>`
   */
  virtualModules: VirtualModule[];
}
