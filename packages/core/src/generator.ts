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
 * Returns the VLQ string for one segment within a mappings group.
 *
 * @param state   - mutable tracker of previous source position across all lines
 * @param genCol  - absolute generated column within the current line
 * @param srcLine - absolute source line
 * @param srcCol  - absolute source column
 */
interface MappingState {
  prevSrcLine: number;
  prevSrcCol: number;
}

function segment(
  state: MappingState,
  genCol: number,
  srcLine: number,
  srcCol: number,
): string {
  const dLine = srcLine - state.prevSrcLine;
  const dCol = srcCol - state.prevSrcCol;
  state.prevSrcLine = srcLine;
  state.prevSrcCol = srcCol;
  // genCol is always the first field; srcIdx=0 (single source file)
  return vlq(genCol) + vlq(0) + vlq(dLine) + vlq(dCol);
}

// ---------------------------------------------------------------------------
// Code + mapping builder
// ---------------------------------------------------------------------------

interface Builder {
  lines: string[];
  /** One mappings group per output line (segments joined by ",", or "" for boilerplate). */
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

/**
 * Append a source line and emit one segment per non-whitespace token for
 * column-level accuracy.
 *
 * @param line       - full generated line (including any added indentation)
 * @param srcLine    - 0-based source line of the content
 * @param srcCol     - 0-based source column where the content begins (usually 0)
 * @param genColBase - generated column where content starts (added-indentation width)
 */
function pushMapped(
  b: Builder,
  line: string,
  srcLine: number,
  srcCol = 0,
  genColBase = 0,
): void {
  b.lines.push(line);

  // Walk the content portion of the line and emit a segment at every token start.
  // Since the content is a verbatim copy of the source (just shifted by genColBase),
  // token at generated column (genColBase + j) maps to source column (srcCol + j).
  const content = line.slice(genColBase);
  const segs: string[] = [];
  let prevGenColInLine = 0; // relative within this line (resets at each ';' separator)
  let inWord = false;

  for (let j = 0; j < content.length; j++) {
    const ch = content[j]!;
    const isWord = ch > " "; // faster than regex for ASCII

    if (isWord && !inWord) {
      const genCol = genColBase + j;
      const tokenSrcCol = srcCol + j;

      segs.push(segment(b.state, genCol - prevGenColInLine, srcLine, tokenSrcCol));
      prevGenColInLine = genCol;
    }
    inWord = isWord;
  }

  b.mappingEntries.push(segs.join(","));
}

// ---------------------------------------------------------------------------
// <script setup> — import hoisting
// ---------------------------------------------------------------------------

interface SetupLine {
  text: string;
  srcLine: number;
}

/**
 * Split `<script setup>` content into:
 *  - `imports`  — static import statements, hoisted to module level
 *  - `body`     — everything else, placed inside the component function
 *
 * Handles multi-line imports by tracking open `{` depth.
 */
function splitSetupContent(
  content: string,
  startLine: number,
): { imports: SetupLine[]; body: SetupLine[] } {
  const lines = content.split("\n");
  const imports: SetupLine[] = [];
  const body: SetupLine[] = [];
  let inImport = false;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? "";
    const srcLine = startLine + i;
    const trimmed = text.trimStart();

    if (!inImport && /^import[\s{*"'`]/.test(trimmed) && !/^import\s*\(/.test(trimmed)) {
      inImport = true;
      imports.push({ text, srcLine });
      // Complete on the same line when it already has  from '...'  or is a bare side-effect import
      if (/from\s+['"`]|^import\s+['"`]/.test(trimmed)) {
        inImport = false;
      }
    } else if (inImport) {
      imports.push({ text, srcLine });
      if (/from\s+['"`]/.test(text)) {
        inImport = false;
      }
    } else {
      body.push({ text, srcLine });
    }
  }

  return { imports, body };
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

  // Whether the component uses <script setup> (affects code layout).
  const hasSetup = descriptor.scriptSetup !== null;

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

  // -- <script setup>: hoist import statements to module level --------------
  let setupBody: SetupLine[] = [];
  if (descriptor.scriptSetup !== null) {
    const { content, loc } = descriptor.scriptSetup;
    const { imports, body } = splitSetupContent(content, loc.start.line);
    for (const { text, srcLine } of imports) {
      pushMapped(b, text, srcLine, 0);
    }
    setupBody = body;
  }

  // -- <script> block (module level, unchanged) -----------------------------
  if (descriptor.script !== null) {
    const { content, loc } = descriptor.script;
    const contentLines = content.split("\n");
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i] ?? "";
      pushMapped(b, line, loc.start.line + i, 0);
    }
  }

  // -- When there is no <script setup>, emit clientScript at module level ---
  // (legacy behaviour: client-only side-effect code runs when the module loads)
  if (!hasSetup && descriptor.clientScript !== null) {
    const { content, loc } = descriptor.clientScript;
    const contentLines = content.split("\n");
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i] ?? "";
      pushMapped(b, line, loc.start.line + i, 0);
    }
  }

  // -- Component function ---------------------------------------------------
  // With <script setup>: wrap setup body + clientScript + template together.
  // Without <script setup>: only wrap template (current behaviour).
  if (hasSetup || descriptor.template !== null) {
    pushBoilerplate(b, "export default function __RsfcComponent__() {");

    // Setup body (non-import declarations, hooks, etc.)
    for (const { text, srcLine } of setupBody) {
      pushMapped(b, "  " + text, srcLine, 0, 2);
    }

    // clientScript inside the function when setup is present
    if (hasSetup && descriptor.clientScript !== null) {
      const { content, loc } = descriptor.clientScript;
      const contentLines = content.split("\n");
      for (let i = 0; i < contentLines.length; i++) {
        const line = contentLines[i] ?? "";
        pushMapped(b, "  " + line, loc.start.line + i, 0, 2);
      }
    }

    if (descriptor.template !== null) {
      const { content, loc } = descriptor.template;
      pushBoilerplate(b, "  return (");
      const templateLines = content.split("\n");
      for (let i = 0; i < templateLines.length; i++) {
        const line = templateLines[i] ?? "";
        pushMapped(b, "    " + line, loc.start.line + i, 0, 4);
      }
      pushBoilerplate(b, "  );");
    }

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
