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
// <script setup> — import hoisting + defineProps macro
// ---------------------------------------------------------------------------

interface SetupLine {
  text: string;
  srcLine: number;
}

/**
 * Extract `defineProps<TYPE>(destructuring)` from setup body lines.
 * Returns the props function parameter string and the body with the
 * defineProps call removed, or null when no call is found.
 *
 * Supports:
 *   const { foo, bar = 0 } = defineProps<{ foo: string; bar?: number }>()
 *   const props = defineProps<Props>()
 */
function extractDefineProps(lines: SetupLine[]): {
  propsArg: string;
  filteredLines: SetupLine[];
} | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.text.trim();
    const match = /^(?:const|let|var)\s+(\{[^}]*\}|\w+)\s*=\s*defineProps\s*</.exec(trimmed);
    if (!match) continue;

    const pattern = match[1]!;
    const ltIdx = trimmed.indexOf("defineProps") + "defineProps".length;

    // Count angle brackets to extract the full type argument, spanning multiple
    // lines when necessary (e.g. defineProps<{\n  x: string\n  y: number\n}>()).
    let depth = 0;
    let typeContent = "";
    let lastLineIdx = i;
    let found = false;

    scan: for (let li = i; li < lines.length; li++) {
      const scanText = li === i ? trimmed : (lines[li]?.text.trim() ?? "");
      const startJ = li === i ? ltIdx : 0;

      for (let j = startJ; j < scanText.length; j++) {
        const ch = scanText[j]!;
        if (ch === "<") {
          depth++;
          if (depth > 1) typeContent += ch; // nested generic, e.g. Array<string>
        } else if (ch === ">") {
          depth--;
          if (depth === 0) {
            lastLineIdx = li;
            found = true;
            break scan;
          }
          typeContent += ch;
        } else if (depth >= 1) {
          typeContent += ch;
        }
      }

      // At a line boundary inside the type, insert a "; " separator (unless the
      // last collected char is an opening brace/angle — no separator needed there).
      if (depth > 0) {
        const t = typeContent.trimEnd();
        if (t && t[t.length - 1] !== "{" && t[t.length - 1] !== "<") {
          typeContent = t + "; ";
        }
      }
    }

    if (!found) continue;

    // Normalise: "{ x: string; y: number; }" → "{ x: string; y: number }"
    const type = typeContent
      .replace(/;\s*}/g, " }")
      .replace(/^{\s*/, "{ ")
      .trim();

    return {
      propsArg: `${pattern}: ${type}`,
      filteredLines: [...lines.slice(0, i), ...lines.slice(lastLineIdx + 1)],
    };
  }
  return null;
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

// ---------------------------------------------------------------------------
// CSS Modules helpers
// ---------------------------------------------------------------------------

/** Collect all .className tokens from a CSS string. */
function extractClassNames(css: string): string[] {
  const names = new Set<string>();
  const re = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    names.add(m[1]!);
  }
  return [...names];
}

/** Replace each `.name` with `.hashedName`. Longer names are processed first
 *  to avoid partial replacement (`.btn-primary` before `.btn`). */
function transformClassNames(css: string, classMap: Record<string, string>): string {
  const entries = Object.entries(classMap).sort(([a], [b]) => b.length - a.length);
  let result = css;
  for (const [name, hashed] of entries) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\.${escaped}(?![a-zA-Z0-9_-])`, "g"), `.${hashed}`);
  }
  return result;
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

  // -- Style blocks — build virtual modules and emit imports ----------------
  // We build the virtualModules array here (alongside the imports) so that
  // CSS module blocks can emit two VMs and two imports atomically.
  const virtualModules: VirtualModule[] = [];

  let unnamedModuleCount = 0;
  for (let i = 0; i < descriptor.styles.length; i++) {
    const style = descriptor.styles[i]!;
    const isModule = "module" in style.attrs;
    // Scoped only applies when module is not set (they are mutually exclusive).
    const isScoped = !isModule && scopeId !== null && "scoped" in style.attrs;

    let cssContent = style.content;
    if (isScoped) cssContent = scopeCss(cssContent, `[${scopeId}]`);

    const styleId = styleVirtualId(descriptor.filename, i, style.lang);

    if (isModule) {
      // Per-block hash so two module blocks in the same file don't collide.
      const blockHash = fnv1a32(`${descriptor.filename}:${i}`);
      const classNames = extractClassNames(cssContent);
      const classMap: Record<string, string> = {};
      for (const name of classNames) {
        classMap[name] = `${name}_${blockHash}`;
      }
      const transformedCss = transformClassNames(cssContent, classMap);

      // Named blocks use the attribute value; unnamed blocks get unique names
      // so multiple <style module> blocks in the same file don't shadow each other.
      const varName =
        typeof style.attrs.module === "string" && style.attrs.module !== ""
          ? style.attrs.module
          : unnamedModuleCount === 0 ? "styles" : `styles_${unnamedModuleCount}`;
      unnamedModuleCount++;

      const cssModuleId = `\0rsfc:cssmodule:${descriptor.filename}:${i}`;

      // Style VM: transformed CSS (class names hashed) for injection.
      virtualModules.push({ id: styleId, code: transformedCss });
      // ClassMap VM: JS default export of the classMap for the consumer.
      virtualModules.push({
        id: cssModuleId,
        code: `export default ${JSON.stringify(classMap)};`,
        classMap,
        moduleVar: varName,
      });

      pushBoilerplate(b, `import "${styleId}";`);
      pushBoilerplate(b, `import ${varName} from "${cssModuleId}";`);
    } else {
      virtualModules.push({ id: styleId, code: cssContent });
      pushBoilerplate(b, `import "${styleId}";`);
    }
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

  // -- clientScript: hoist imports to module level, collect body for later ----
  // Static import declarations cannot appear inside blocks or functions, so we
  // split the block and emit imports here regardless of whether setup is present.
  let clientScriptBody: SetupLine[] = [];
  if (descriptor.clientScript !== null) {
    const { content, loc } = descriptor.clientScript;
    const { imports, body } = splitSetupContent(content, loc.start.line);
    for (const { text, srcLine } of imports) {
      pushMapped(b, text, srcLine, 0);
    }
    clientScriptBody = body;
  }

  // -- When there is no <script setup>, emit clientScript body at module level -
  if (!hasSetup && clientScriptBody.length > 0) {
    pushBoilerplate(b, "if (typeof document !== 'undefined') {");
    for (const { text, srcLine } of clientScriptBody) {
      pushMapped(b, "  " + text, srcLine, 0, 2);
    }
    pushBoilerplate(b, "}");
  }

  // -- Component function ---------------------------------------------------
  // With <script setup>: wrap setup body + clientScript + template together.
  // Without <script setup>: only wrap template (current behaviour).
  if (hasSetup || descriptor.template !== null) {
    // Resolve defineProps<T>() macro so the component function is typed.
    const definePropsResult = hasSetup ? extractDefineProps(setupBody) : null;
    const componentBody = definePropsResult?.filteredLines ?? setupBody;
    const propsArg = definePropsResult?.propsArg ?? "";

    pushBoilerplate(b, `export default function __RsfcComponent__(${propsArg}) {`);

    // Setup body (non-import declarations, hooks, etc.)
    for (const { text, srcLine } of componentBody) {
      pushMapped(b, "  " + text, srcLine, 0, 2);
    }

    // clientScript body inside the function when setup is present
    if (hasSetup && clientScriptBody.length > 0) {
      pushBoilerplate(b, "  if (typeof document !== 'undefined') {");
      for (const { text, srcLine } of clientScriptBody) {
        pushMapped(b, "    " + text, srcLine, 0, 4);
      }
      pushBoilerplate(b, "  }");
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

  return { code, map, virtualModules };
}

function styleVirtualId(filename: string, index: number, lang?: string): string {
  // Always include a CSS-family extension so Vite's CSS transform pipeline
  // can recognise and process the virtual module by extension.
  const ext = lang && lang !== "css" ? `.${lang}` : ".css";
  return `\0rsfc:style:${filename}:${index}${ext}`;
}
