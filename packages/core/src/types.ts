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
// Descriptor types — produced by the parser
// ---------------------------------------------------------------------------

export type RsfcBlockKind = "script" | "clientScript" | "template" | "style";

export interface RsfcBlock {
  kind: RsfcBlockKind;
  /** Raw source text of the block content (excluding the wrapping tags). */
  content: string;
  /** Language attribute value, e.g. "tsx", "scss". Undefined when absent. */
  lang?: string | undefined;
  /** 0-based line offset of the block content start within the source file. */
  startLine: number;
  /** Attributes declared on the opening tag, excluding `lang`. */
  attrs: Record<string, string | true>;
}

export interface RsfcParseError {
  message: string;
  line: number;
}

export interface RsfcDescriptor {
  filename: string;
  source: string;
  script: RsfcBlock | null;
  clientScript: RsfcBlock | null;
  template: RsfcBlock | null;
  styles: RsfcBlock[];
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
