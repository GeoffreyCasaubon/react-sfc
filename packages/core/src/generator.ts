import type {
  GeneratedOutput,
  RawSourceMap,
  RsfcDescriptor,
  VirtualModule,
} from "./types.js";

// ---------------------------------------------------------------------------
// VLQ / source map helpers
// ---------------------------------------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Encode a single signed integer as a VLQ base64 string. */
function vlq(n: number): string {
  // Signed VLQ: n >= 0 → n<<1, n < 0 → (-n<<1)|1
  let v = n >= 0 ? n << 1 : ((-n) << 1) | 1;
  let out = "";
  do {
    let digit = v & 0x1f;
    v >>>= 5;
    if (v > 0) digit |= 0x20;
    out += B64[digit];
  } while (v > 0);
  return out;
}

/**
 * Encode one source-mapped segment.
 * All four values are absolute; the encoder tracks and outputs deltas.
 */
interface MappingState {
  prevSrcLine: number;
  prevSrcCol: number;
}

function segment(
  state: MappingState,
  srcLine: number,
  srcCol: number
): string {
  const dLine = srcLine - state.prevSrcLine;
  const dCol = srcCol - state.prevSrcCol;
  state.prevSrcLine = srcLine;
  state.prevSrcCol = srcCol;
  // genCol=0 (always start of line), srcIdx=0 (single source file), dLine, dCol
  return vlq(0) + vlq(0) + vlq(dLine) + vlq(dCol);
}

// ---------------------------------------------------------------------------
// Code + mapping builder
// ---------------------------------------------------------------------------

interface Builder {
  lines: string[];
  /** One mappings entry per output line ("" = no source mapping). */
  mappingEntries: string[];
  state: MappingState;
}

function makeBuilder(): Builder {
  return {
    lines: [],
    mappingEntries: [],
    state: { prevSrcLine: 0, prevSrcCol: 0 },
  };
}

/** Append a generated line with no source mapping (boilerplate). */
function pushBoilerplate(b: Builder, line: string): void {
  b.lines.push(line);
  b.mappingEntries.push("");
}

/** Append a source line with a mapping back to (srcLine, srcCol). */
function pushMapped(
  b: Builder,
  line: string,
  srcLine: number,
  srcCol = 0
): void {
  b.lines.push(line);
  b.mappingEntries.push(segment(b.state, srcLine, srcCol));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generate(descriptor: RsfcDescriptor): GeneratedOutput {
  const b = makeBuilder();

  // -- Style imports (one per style block, in order) -----------------------
  for (let i = 0; i < descriptor.styles.length; i++) {
    const id = styleVirtualId(descriptor.filename, i);
    // Use a template literal instead of JSON.stringify so the \0 null char
    // is preserved verbatim — bundlers (Vite/Rollup) intercept these IDs
    // in memory and never write them to disk.
    pushBoilerplate(b, `import "${id}";`);
  }

  // -- <script> block -------------------------------------------------------
  if (descriptor.script !== null) {
    const { content, loc } = descriptor.script;
    const contentLines = content.split("\n");
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i] ?? "";
      pushMapped(b, line, loc.start.line + i, 0);
    }
  }

  // -- <clientScript> block -------------------------------------------------
  if (descriptor.clientScript !== null) {
    const { content, loc } = descriptor.clientScript;
    const contentLines = content.split("\n");
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i] ?? "";
      pushMapped(b, line, loc.start.line + i, 0);
    }
  }

  // -- <template> block → default export ------------------------------------
  if (descriptor.template !== null) {
    const { content, loc } = descriptor.template;
    pushBoilerplate(b, "export default function __RsfcComponent__() {");
    pushBoilerplate(b, "  return (");
    const templateLines = content.split("\n");
    for (let i = 0; i < templateLines.length; i++) {
      const line = templateLines[i] ?? "";
      pushMapped(b, "    " + line, loc.start.line + i, 0);
    }
    pushBoilerplate(b, "  );");
    pushBoilerplate(b, "}");
  }

  const code = b.lines.join("\n");

  const map: RawSourceMap = {
    version: 3,
    sources: [descriptor.filename],
    sourcesContent: [descriptor.source],
    names: [],
    mappings: b.mappingEntries.join(";"),
  };

  const virtualModules: VirtualModule[] = descriptor.styles.map(
    (style, i) => ({
      id: styleVirtualId(descriptor.filename, i),
      code: style.content,
    })
  );

  return { code, map, virtualModules };
}

function styleVirtualId(filename: string, index: number): string {
  return `\0rsfc:style:${filename}:${index}`;
}
