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
// Scope id helpers — <style scoped> support
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash → 8-char hex string. Deterministic scope id from filename. */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Append `attr` before any trailing pseudo-elements on a single CSS selector. */
function scopeSelector(sel: string, attr: string): string {
  const trimmed = sel.trim();
  if (!trimmed) return sel;
  const leadWs = /^\s*/.exec(sel)?.[0] ?? "";
  const trailWs = /\s*$/.exec(sel)?.[0] ?? "";
  // Insert attr before trailing double-colon pseudo-elements (::before etc.)
  const pseudoRe = /((?:::[\w-]+(?:\([^)]*\))?)+)$/;
  const m = pseudoRe.exec(trimmed);
  if (m) {
    const base = trimmed.slice(0, trimmed.length - m[0].length);
    return leadWs + base + attr + m[0] + trailWs;
  }
  return leadWs + trimmed + attr + trailWs;
}

function scopeSelectorList(list: string, attr: string): string {
  return list
    .split(",")
    .map((sel) => scopeSelector(sel, attr))
    .join(",");
}

// @-rules whose entire block must be passed through unchanged (no selector inside).
const SKIP_AT = /^@(?:keyframes|font-face|charset|import|layer|namespace)[\s({]/i;

/**
 * Append `attr` to every CSS selector in `css`.
 * @keyframes / @font-face blocks are left untouched.
 * @media / @supports contents are recursively scoped.
 * Works on both plain CSS and raw SCSS (before compilation).
 */
export function scopeCss(css: string, attr: string): string {
  let out = "";
  let i = 0;
  let depth = 0;
  let skipAt = -1; // depth at which we entered a skip @-rule block

  while (i < css.length) {
    const open = css.indexOf("{", i);
    const close = css.indexOf("}", i);
    if (open === -1 && close === -1) { out += css.slice(i); break; }

    const isOpen = open !== -1 && (close === -1 || open < close);
    if (isOpen) {
      const token = css.slice(i, open);
      if (skipAt >= 0) {
        out += token + "{";
      } else if (SKIP_AT.test(token.trim())) {
        skipAt = depth;
        out += token + "{";
      } else if (token.trim().startsWith("@")) {
        // @media, @supports, etc. — scope contents, not the @-rule itself
        out += token + "{";
      } else {
        out += scopeSelectorList(token, attr) + "{";
      }
      i = open + 1;
      depth++;
    } else {
      out += css.slice(i, close + 1);
      i = close + 1;
      depth--;
      if (skipAt >= 0 && depth === skipAt) skipAt = -1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generate(descriptor: RsfcDescriptor): GeneratedOutput {
  const b = makeBuilder();

  // Detect scoped style blocks and compute a stable scope id from the filename.
  const hasScoped = descriptor.styles.some((s) => "scoped" in s.attrs);
  const scopeId = hasScoped ? `data-v-${fnv1a32(descriptor.filename)}` : null;

  // -- JSX scope factory (must come before any JSX) -------------------------
  // Pragma comments switch esbuild from the automatic runtime to a custom
  // factory (__h) that stamps every native DOM element with the scope attribute.
  if (scopeId !== null) {
    pushBoilerplate(b, `/** @jsxRuntime classic */`);
    pushBoilerplate(b, `/** @jsx __h */`);
    pushBoilerplate(b, `/** @jsxFrag __f */`);
    pushBoilerplate(b, `import * as __React from "react";`);
    pushBoilerplate(b, `const __h = (t, p, ...c) => __React.createElement(t, typeof t === "string" ? {...(p ?? {}), "${scopeId}": ""} : p, ...c);`);
    pushBoilerplate(b, `const __f = __React.Fragment;`);
  }

  // -- Style imports (one per style block, in order) ------------------------
  for (let i = 0; i < descriptor.styles.length; i++) {
    const style = descriptor.styles[i]!;
    const id = styleVirtualId(descriptor.filename, i, style.lang);
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

  const virtualModules: VirtualModule[] = descriptor.styles.map((style, i) => ({
    id: styleVirtualId(descriptor.filename, i, style.lang),
    // Apply CSS scoping before the plugin compiles SCSS (works for both CSS and SCSS).
    code: scopeId !== null && "scoped" in style.attrs
      ? scopeCss(style.content, `[${scopeId}]`)
      : style.content,
  }));

  return { code, map, virtualModules };
}

function styleVirtualId(filename: string, index: number, lang?: string): string {
  const ext = lang && lang !== "css" ? `.${lang}` : "";
  return `\0rsfc:style:${filename}:${index}${ext}`;
}
