import { describe, it, expect } from "vitest";
import { parse } from "./parser.js";
import { generate, scopeCss } from "./generator.js";
import type { RsfcDescriptor } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function src(...lines: string[]): string {
  return lines.join("\n");
}

/** Build a descriptor directly from source, convenience wrapper. */
function parseAndGenerate(source: string, filename = "/test.rsfc") {
  return generate(parse(source, { filename }));
}

/** Empty descriptor — no blocks, no errors. */
const EMPTY_DESCRIPTOR: RsfcDescriptor = {
  filename: "/empty.rsfc",
  source: "",
  script: null,
  scriptSetup: null,
  clientScript: null,
  template: null,
  styles: [],
  docs: null,
  customBlocks: [],
  errors: [],
};

// ---------------------------------------------------------------------------
// Source map shape — always required
// ---------------------------------------------------------------------------

describe("source map (always present)", () => {
  it("output always contains a valid V3 source map", () => {
    const { map } = generate(EMPTY_DESCRIPTOR);
    expect(map.version).toBe(3);
    expect(map.sources).toEqual(["/empty.rsfc"]);
    expect(Array.isArray(map.names)).toBe(true);
    expect(typeof map.mappings).toBe("string");
  });

  it("sourcesContent embeds the original source text", () => {
    const source = "<script>\nconst x = 1\n</script>";
    const { map } = parseAndGenerate(source, "/comp.rsfc");
    expect(map.sourcesContent).toBeDefined();
    expect(map.sourcesContent?.[0]).toBe(source);
  });

  it("sources array contains the filename", () => {
    const { map } = parseAndGenerate("", "/path/to/MyComp.rsfc");
    expect(map.sources).toEqual(["/path/to/MyComp.rsfc"]);
  });

  it("names array is always present (may be empty)", () => {
    const { map } = parseAndGenerate("<template><div/></template>");
    expect(Array.isArray(map.names)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty descriptor
// ---------------------------------------------------------------------------

describe("empty descriptor", () => {
  it("produces empty code and no virtual modules", () => {
    const { code, virtualModules } = generate(EMPTY_DESCRIPTOR);
    expect(code.trim()).toBe("");
    expect(virtualModules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Script block
// ---------------------------------------------------------------------------

describe("script block", () => {
  it("includes script content verbatim in the output", () => {
    const source = src("<script>", "export const answer = 42", "</script>");
    const { code } = parseAndGenerate(source);
    expect(code).toContain("export const answer = 42");
  });

  it("preserves multi-line script content", () => {
    const source = src(
      "<script>",
      "export function greet(name: string) {",
      "  return `Hello, ${name}!`",
      "}",
      "</script>"
    );
    const { code } = parseAndGenerate(source);
    expect(code).toContain("export function greet");
    expect(code).toContain("return `Hello, ${name}!`");
  });
});

// ---------------------------------------------------------------------------
// clientScript block
// ---------------------------------------------------------------------------

describe("clientScript block", () => {
  it("includes clientScript content in the output", () => {
    const source = src(
      "<clientScript>",
      'import { useState } from "react"',
      "</clientScript>"
    );
    const { code } = parseAndGenerate(source);
    expect(code).toContain("useState");
  });
});

// ---------------------------------------------------------------------------
// Template block
// ---------------------------------------------------------------------------

describe("template block", () => {
  it("wraps template content in a default-exported function", () => {
    const source = src("<template>", "<div>Hello</div>", "</template>");
    const { code } = parseAndGenerate(source);
    expect(code).toContain("export default");
    expect(code).toContain("<div>Hello</div>");
  });

  it("generated component contains the raw template content", () => {
    const source = src(
      "<template>",
      "<>{items.map(i => <Item key={i.id} />)}</>",
      "</template>"
    );
    const { code } = parseAndGenerate(source);
    expect(code).toContain("items.map");
    expect(code).toContain("<Item");
  });
});

// ---------------------------------------------------------------------------
// Style blocks → virtual modules
// ---------------------------------------------------------------------------

describe("style virtual modules", () => {
  it("generates one virtual module per style block", () => {
    const source = src("<style>", ".foo { color: red; }", "</style>");
    const { virtualModules } = parseAndGenerate(source, "/a.rsfc");
    expect(virtualModules).toHaveLength(1);
  });

  it("virtual module id follows the \\0rsfc:style:<filename>:<index>.css convention", () => {
    const source = src("<style>.foo{}</style>");
    const { virtualModules } = parseAndGenerate(source, "/path/comp.rsfc");
    expect(virtualModules[0]?.id).toBe("\0rsfc:style:/path/comp.rsfc:0.css");
  });

  it("virtual module code contains the raw style content", () => {
    const source = src("<style>", ".foo { color: red; }", "</style>");
    const { virtualModules } = parseAndGenerate(source, "/a.rsfc");
    expect(virtualModules[0]?.code).toContain(".foo { color: red; }");
  });

  it("generates multiple virtual modules in source order", () => {
    const source = src(
      "<style>.base{}</style>",
      '<style lang="scss">.theme{}</style>'
    );
    const { virtualModules } = parseAndGenerate(source, "/a.rsfc");
    expect(virtualModules).toHaveLength(2);
    // Plain CSS block — always gets .css extension so Vite can detect and process it
    expect(virtualModules[0]?.id).toBe("\0rsfc:style:/a.rsfc:0.css");
    // SCSS block — lang appended so the bundler pipeline can detect the preprocessor
    expect(virtualModules[1]?.id).toBe("\0rsfc:style:/a.rsfc:1.scss");
    expect(virtualModules[0]?.code).toContain(".base");
    expect(virtualModules[1]?.code).toContain(".theme");
  });

  it("appends lang extension to virtual module id for preprocessed styles", () => {
    const source = src('<style lang="sass">.foo\n  color: red</style>');
    const { virtualModules } = parseAndGenerate(source, "/a.rsfc");
    expect(virtualModules[0]?.id).toBe("\0rsfc:style:/a.rsfc:0.sass");
  });

  it("generated code imports each style virtual module", () => {
    const source = src("<style>.a{}</style>", "<style>.b{}</style>");
    const { code } = parseAndGenerate(source, "/a.rsfc");
    // The null char is kept verbatim in the generated import string
    expect(code).toContain("rsfc:style:/a.rsfc:0");
    expect(code).toContain("rsfc:style:/a.rsfc:1");
  });

  it("produces no virtual modules when there are no style blocks", () => {
    const source = "<script>export const x = 1</script>";
    const { virtualModules } = parseAndGenerate(source);
    expect(virtualModules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// All blocks together
// ---------------------------------------------------------------------------

describe("all blocks combined", () => {
  it("produces coherent output with all four block types", () => {
    const source = src(
      "<script>",
      "export async function loader() { return {} }",
      "</script>",
      "<clientScript>",
      'import { useEffect } from "react"',
      "</clientScript>",
      "<template>",
      "<main><h1>Hello</h1></main>",
      "</template>",
      "<style>",
      "main { padding: 1rem; }",
      "</style>"
    );
    const { code, map, virtualModules } = parseAndGenerate(source, "/page.rsfc");

    expect(code).toContain("loader");
    expect(code).toContain("useEffect");
    expect(code).toContain("export default");
    expect(code).toContain("<main>");
    expect(code).toContain("rsfc:style:/page.rsfc:0");
    expect(virtualModules).toHaveLength(1);
    expect(map.version).toBe(3);
    expect(map.sourcesContent?.[0]).toBe(source);
  });

  it("style imports appear before other code", () => {
    const source = src(
      "<script>export const x = 1</script>",
      "<style>.foo{}</style>"
    );
    const { code } = parseAndGenerate(source, "/a.rsfc");
    const importIdx = code.indexOf("rsfc:style");
    const scriptIdx = code.indexOf("export const x");
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeLessThan(scriptIdx);
  });
});

// ---------------------------------------------------------------------------
// scopeCss — standalone unit tests
// ---------------------------------------------------------------------------

describe("scopeCss", () => {
  const attr = "[data-v-test]";

  it("appends attribute to a simple class selector", () => {
    expect(scopeCss(".foo { color: red; }", attr)).toBe(".foo[data-v-test] { color: red; }");
  });

  it("appends attribute to each selector in a comma-separated list", () => {
    expect(scopeCss(".foo, .bar { }", attr)).toBe(".foo[data-v-test], .bar[data-v-test] { }");
  });

  it("appends attribute to element selectors", () => {
    expect(scopeCss("h1 { margin: 0; }", attr)).toBe("h1[data-v-test] { margin: 0; }");
  });

  it("appends attribute to the last selector in a descendant chain", () => {
    // Only the last compound selector gets the attribute
    expect(scopeCss(".parent .child { }", attr)).toContain(".child[data-v-test]");
  });

  it("inserts attribute before ::before / ::after pseudo-elements", () => {
    expect(scopeCss(".foo::before { content: ''; }", attr)).toContain(
      ".foo[data-v-test]::before"
    );
  });

  it("leaves @keyframes blocks untouched", () => {
    const css = "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";
    expect(scopeCss(css, attr)).toBe(css);
  });

  it("scopes selectors inside @media blocks", () => {
    const result = scopeCss("@media (min-width: 768px) { .foo { color: red; } }", attr);
    expect(result).toContain(".foo[data-v-test]");
    expect(result).toContain("@media");
  });

  it("scopes nested SCSS selectors (before compilation)", () => {
    const scss = ".parent { .child { color: red; } }";
    const result = scopeCss(scss, attr);
    expect(result).toContain(".parent[data-v-test]");
    expect(result).toContain(".child[data-v-test]");
  });
});

// ---------------------------------------------------------------------------
// Scoped styles — generate() integration
// ---------------------------------------------------------------------------

describe("scoped styles", () => {
  it("scopes CSS selectors in <style scoped> virtual module", () => {
    const source = "<style scoped>.foo { color: red; }</style>";
    const { virtualModules } = parseAndGenerate(source, "/comp.rsfc");
    expect(virtualModules[0]?.code).toMatch(/\.foo\[data-v-[0-9a-f]+\]/);
  });

  it("does not scope <style> blocks without the scoped attribute", () => {
    const source = "<style>.foo { color: red; }</style>";
    const { virtualModules } = parseAndGenerate(source, "/comp.rsfc");
    expect(virtualModules[0]?.code).toBe(".foo { color: red; }");
  });

  it("only scopes blocks that have the scoped attribute when mixed", () => {
    const source = src(
      "<style>.global { }</style>",
      "<style scoped>.local { }</style>"
    );
    const { virtualModules } = parseAndGenerate(source, "/comp.rsfc");
    expect(virtualModules[0]?.code).toBe(".global { }");
    expect(virtualModules[1]?.code).toMatch(/\.local\[data-v-[0-9a-f]+\]/);
  });

  it("scope id is derived from filename — same file always produces same id", () => {
    const source = "<style scoped>.x{}</style>";
    const r1 = parseAndGenerate(source, "/comp.rsfc");
    const r2 = parseAndGenerate(source, "/comp.rsfc");
    expect(r1.virtualModules[0]?.code).toBe(r2.virtualModules[0]?.code);
  });

  it("different filenames produce different scope ids", () => {
    const source = "<style scoped>.x{}</style>";
    const r1 = parseAndGenerate(source, "/a.rsfc");
    const r2 = parseAndGenerate(source, "/b.rsfc");
    expect(r1.virtualModules[0]?.code).not.toBe(r2.virtualModules[0]?.code);
  });

  it("injects JSX pragma and __h factory when scoped", () => {
    const source = "<style scoped>.x{}</style><template><div/></template>";
    const { code } = parseAndGenerate(source, "/comp.rsfc");
    expect(code).toContain("@jsxRuntime classic");
    expect(code).toContain("@jsx __h");
    expect(code).toContain("const __h =");
  });

  it("does not inject JSX pragma for non-scoped components", () => {
    const source = "<style>.x{}</style><template><div/></template>";
    const { code } = parseAndGenerate(source, "/comp.rsfc");
    expect(code).not.toContain("@jsxRuntime classic");
    expect(code).not.toContain("const __h =");
  });

  it("__h factory stamps native DOM elements with the scope attribute", () => {
    const source = "<style scoped>.x{}</style>";
    const { code } = parseAndGenerate(source, "/comp.rsfc");
    // The factory spreads the scope id onto native element props
    expect(code).toMatch(/data-v-[0-9a-f]+/);
  });
});

// ---------------------------------------------------------------------------
// <script setup>
// ---------------------------------------------------------------------------

describe("<script setup>", () => {
  it("makes top-level variables available in the template without export", () => {
    const source = src(
      "<script setup>",
      "const greeting = 'Hello'",
      "</script>",
      "<template><span>{greeting}</span></template>"
    );
    const { code } = parseAndGenerate(source);
    // greeting is declared inside the component function, not at module level
    expect(code).toContain("const greeting");
    expect(code).toContain("export default function __RsfcComponent__");
    // The component function contains both the declaration and the template
    const fnStart = code.indexOf("export default function");
    const greetingIdx = code.indexOf("const greeting");
    expect(greetingIdx).toBeGreaterThan(fnStart);
  });

  it("hoists import statements to module level", () => {
    const source = src(
      "<script setup>",
      "import { useState } from 'react'",
      "const [count, setCount] = useState(0)",
      "</script>",
      "<template><div>{count}</div></template>"
    );
    const { code } = parseAndGenerate(source);
    const importIdx = code.indexOf("import { useState }");
    const fnStart = code.indexOf("export default function");
    // import must appear BEFORE the component function
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeLessThan(fnStart);
    // useState call is INSIDE the function
    const useStateCallIdx = code.indexOf("useState(0)");
    expect(useStateCallIdx).toBeGreaterThan(fnStart);
  });

  it("handles multi-line imports", () => {
    const source = src(
      "<script setup>",
      "import {",
      "  useState,",
      "  useEffect,",
      "} from 'react'",
      "const x = 1",
      "</script>",
      "<template><div/></template>"
    );
    const { code } = parseAndGenerate(source);
    const fnStart = code.indexOf("export default function");
    expect(code.indexOf("useState,")).toBeLessThan(fnStart);
    expect(code.indexOf("const x = 1")).toBeGreaterThan(fnStart);
  });

  it("wraps setup body and template in a single component function", () => {
    const source = src(
      "<script setup>",
      "import { useState } from 'react'",
      "const [n, setN] = useState(0)",
      "function inc() { setN(n + 1) }",
      "</script>",
      "<template><button onClick={inc}>{n}</button></template>"
    );
    const { code } = parseAndGenerate(source);
    expect(code).toContain("export default function __RsfcComponent__");
    // Only one component function
    expect(code.split("export default function").length).toBe(2);
    // Both body and template are inside
    const fn = code.slice(code.indexOf("export default function"));
    expect(fn).toContain("useState(0)");
    expect(fn).toContain("<button");
  });

  it("coexists with a regular <script> block (module-level exports)", () => {
    const source = src(
      "<script>",
      "export const API_URL = '/api'",
      "</script>",
      "<script setup>",
      "import { useState } from 'react'",
      "const [x, setX] = useState(0)",
      "</script>",
      "<template><div>{x}</div></template>"
    );
    const { code } = parseAndGenerate(source);
    // Module-level export from <script>
    expect(code).toContain("export const API_URL");
    // Hook call inside the component function
    const fnStart = code.indexOf("export default function");
    expect(code.indexOf("useState(0)")).toBeGreaterThan(fnStart);
  });

  it("generates no component function when only <script setup> with no template", () => {
    const source = src(
      "<script setup>",
      "import { useState } from 'react'",
      "const x = 1",
      "</script>"
    );
    const { code } = parseAndGenerate(source);
    // Still wraps in a function (setup code must run inside a component)
    expect(code).toContain("export default function __RsfcComponent__");
    // Import is hoisted
    expect(code.indexOf("import { useState }")).toBeLessThan(
      code.indexOf("export default function")
    );
  });
});

// ---------------------------------------------------------------------------
// Source map mappings sanity
// ---------------------------------------------------------------------------

describe("source map mappings", () => {
  it("mappings string is non-empty when there is content to map", () => {
    const source = src("<script>", "const x = 1", "</script>");
    const { map } = parseAndGenerate(source);
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  it("mappings has at least as many semicolons as generated lines minus one", () => {
    const source = src("<script>", "line1", "line2", "line3", "</script>");
    const { map, code } = parseAndGenerate(source);
    const generatedLineCount = code.split("\n").length;
    const separatorCount = map.mappings.split(";").length;
    expect(separatorCount).toBe(generatedLineCount);
  });
});

// ---------------------------------------------------------------------------
// <docs> block and custom blocks — generator ignores them
// ---------------------------------------------------------------------------

describe("docs and custom blocks — generator ignores them", () => {
  it("<docs> block does not affect generated code", () => {
    const { code } = parseAndGenerate(
      "<docs># My Component\nSome docs.</docs><script>export const x = 1</script>"
    );
    expect(code).toContain("x = 1");
    expect(code).not.toContain("My Component");
    expect(code).not.toContain("docs");
  });

  it("<docs> block does not produce virtual modules", () => {
    const { virtualModules } = parseAndGenerate("<docs>Some docs</docs>");
    expect(virtualModules).toHaveLength(0);
  });

  it("custom blocks do not appear in generated code", () => {
    const { code } = parseAndGenerate(
      "<graphql>{ user { id } }</graphql><script>export const x = 1</script>"
    );
    expect(code).toContain("x = 1");
    expect(code).not.toContain("graphql");
    expect(code).not.toContain("user");
  });

  it("custom blocks do not produce virtual modules", () => {
    const { virtualModules } = parseAndGenerate("<i18n>{ en: 'Hello' }</i18n>");
    expect(virtualModules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CSS Modules
// ---------------------------------------------------------------------------

describe("CSS modules — <style module>", () => {
  it("emits a default import for the cssmodule virtual module", () => {
    const { code } = parseAndGenerate('<style module>.btn{}</style>', "/a.rsfc");
    expect(code).toContain('import styles from "\0rsfc:cssmodule:/a.rsfc:0"');
  });

  it("emits a side-effect import for the style virtual module", () => {
    const { code } = parseAndGenerate('<style module>.btn{}</style>', "/a.rsfc");
    expect(code).toContain('import "\0rsfc:style:/a.rsfc:0.css"');
  });

  it("produces a classMap with hashed names in the cssmodule virtual module", () => {
    const { virtualModules } = parseAndGenerate('<style module>.btn { color: red; }</style>', "/a.rsfc");
    const cssModVm = virtualModules.find((vm) => vm.id.startsWith("\0rsfc:cssmodule:"));
    expect(cssModVm).toBeDefined();
    expect(cssModVm!.classMap).toBeDefined();
    const keys = Object.keys(cssModVm!.classMap!);
    expect(keys).toContain("btn");
    // Hash suffix must be present
    expect(cssModVm!.classMap!["btn"]).toMatch(/^btn_[0-9a-f]{8}$/);
  });

  it("transforms class names in the style virtual module CSS", () => {
    const { virtualModules } = parseAndGenerate('<style module>.btn { color: red; }</style>', "/a.rsfc");
    const styleVm = virtualModules.find((vm) => vm.id.startsWith("\0rsfc:style:"));
    expect(styleVm).toBeDefined();
    // Raw .btn should be replaced with hashed name in the CSS
    expect(styleVm!.code).not.toContain(".btn {");
    expect(styleVm!.code).toMatch(/\.btn_[0-9a-f]{8}/);
  });

  it("uses the module attribute value as the variable name", () => {
    const { code } = parseAndGenerate('<style module="theme">.foo{}</style>', "/a.rsfc");
    expect(code).toContain('import theme from "\0rsfc:cssmodule:/a.rsfc:0"');
  });

  it("falls back to 'styles' when module attribute is boolean true", () => {
    const { code } = parseAndGenerate('<style module>.foo{}</style>', "/a.rsfc");
    expect(code).toContain("import styles from");
  });

  it("sets moduleVar on the cssmodule virtual module", () => {
    const { virtualModules } = parseAndGenerate('<style module="theme">.foo{}</style>', "/a.rsfc");
    const cssModVm = virtualModules.find((vm) => vm.moduleVar !== undefined);
    expect(cssModVm?.moduleVar).toBe("theme");
  });

  it("two module blocks in the same file get different hashes", () => {
    const { virtualModules } = parseAndGenerate(
      '<style module>.foo{}</style><style module="other">.foo{}</style>',
      "/a.rsfc"
    );
    const [vm0, vm1] = virtualModules
      .filter((vm) => vm.classMap !== undefined)
      .map((vm) => vm.classMap!["foo"]);
    expect(vm0).toBeDefined();
    expect(vm1).toBeDefined();
    expect(vm0).not.toBe(vm1);
  });

  it("does not scope a module style (module and scoped are mutually exclusive)", () => {
    const { virtualModules } = parseAndGenerate(
      '<style module scoped>.foo{}</style>',
      "/a.rsfc"
    );
    const styleVm = virtualModules.find((vm) => vm.id.startsWith("\0rsfc:style:"));
    // Should NOT contain data-v- scope attribute
    expect(styleVm!.code).not.toContain("data-v-");
  });
});

// ---------------------------------------------------------------------------
// Column-level source maps
// ---------------------------------------------------------------------------

/** Decode a single VLQ base64 value (returns the signed integer). */
function decodeVlq(str: string, pos: { i: number }): number {
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = 0;
  let shift = 0;
  let digit: number;
  do {
    const ch = str[pos.i++]!;
    digit = B64.indexOf(ch);
    result |= (digit & 0x1f) << shift;
    shift += 5;
  } while (digit & 0x20);
  // sign bit is the lowest bit
  return (result & 1) ? -(result >> 1) : (result >> 1);
}

/** Parse all segments from a mappings string into [genCol, srcFile, srcLine, srcCol][] per line. */
function parseMappings(mappings: string): Array<Array<[number, number, number, number]>> {
  const lines = mappings.split(";");
  // V3 spec: genCol resets to 0 at each line boundary, but srcLine/srcCol
  // accumulate across all lines (they are always deltas from the previous segment).
  let prevSrcLine = 0, prevSrcCol = 0;
  return lines.map((group) => {
    if (!group) return [];
    const segs = group.split(",");
    let prevGenCol = 0;
    return segs.map((seg) => {
      const pos = { i: 0 };
      const genColDelta = decodeVlq(seg, pos);
      const srcFile = decodeVlq(seg, pos);
      const srcLineDelta = decodeVlq(seg, pos);
      const srcColDelta = decodeVlq(seg, pos);
      const genCol = prevGenCol + genColDelta;
      const srcLine = prevSrcLine + srcLineDelta;
      const srcCol = prevSrcCol + srcColDelta;
      prevGenCol = genCol;
      prevSrcLine = srcLine;
      prevSrcCol = srcCol;
      return [genCol, srcFile, srcLine, srcCol] as [number, number, number, number];
    });
  });
}

describe("column-level source maps", () => {
  it("emits multiple segments per line for multi-token script content", () => {
    const source = src("<script>", "const x = 1", "</script>");
    const { map, code } = parseAndGenerate(source);
    const codeLines = code.split("\n");
    // Find the generated line containing "const x = 1"
    const lineIdx = codeLines.findIndex((l) => l.includes("const"));
    expect(lineIdx).toBeGreaterThanOrEqual(0);
    const allSegs = parseMappings(map.mappings);
    const segsOnLine = allSegs[lineIdx]!;
    // Should have segments for "const", "x", "=", "1" → at least 4
    expect(segsOnLine.length).toBeGreaterThanOrEqual(4);
  });

  it("maps token columns correctly for script lines (no indentation)", () => {
    // "const x = 1" in source (srcLine for this content = line 1, col 0)
    const source = src("<script>", "const x = 1", "</script>");
    const { map, code } = parseAndGenerate(source);
    const codeLines = code.split("\n");
    const lineIdx = codeLines.findIndex((l) => l.trim() === "const x = 1");
    const allSegs = parseMappings(map.mappings);
    const segsOnLine = allSegs[lineIdx]!;

    // "const" → genCol=0, srcCol=0
    expect(segsOnLine[0]?.[0]).toBe(0);  // genCol
    expect(segsOnLine[0]?.[3]).toBe(0);  // srcCol

    // "x" is 6 chars after "const " → genCol=6, srcCol=6
    expect(segsOnLine[1]?.[0]).toBe(6);
    expect(segsOnLine[1]?.[3]).toBe(6);
  });

  it("maps token columns correctly for template lines (4-space indent)", () => {
    const source = src("<template>", "const x = 1", "</template>");
    const { map, code } = parseAndGenerate(source);
    const codeLines = code.split("\n");
    // Generated line is "    const x = 1" (4 spaces indent)
    const lineIdx = codeLines.findIndex((l) => l.startsWith("    const"));
    expect(lineIdx).toBeGreaterThanOrEqual(0);
    const allSegs = parseMappings(map.mappings);
    const segsOnLine = allSegs[lineIdx]!;

    // "const" at generated col 4 → source col 0
    expect(segsOnLine[0]?.[0]).toBe(4);  // genCol
    expect(segsOnLine[0]?.[3]).toBe(0);  // srcCol

    // "x" at generated col 10 → source col 6
    expect(segsOnLine[1]?.[0]).toBe(10);
    expect(segsOnLine[1]?.[3]).toBe(6);
  });

  it("maps token columns correctly for script setup body (2-space indent)", () => {
    const source = src(
      "<script setup>",
      "import { useState } from 'react'",
      "const count = 0",
      "</script>",
      "<template><div/></template>"
    );
    const { map, code } = parseAndGenerate(source);
    const codeLines = code.split("\n");
    // Setup body line: "  const count = 0"
    const lineIdx = codeLines.findIndex((l) => l.startsWith("  const count"));
    expect(lineIdx).toBeGreaterThanOrEqual(0);
    const allSegs = parseMappings(map.mappings);
    const segsOnLine = allSegs[lineIdx]!;

    // "const" at genCol=2 → srcCol=0
    expect(segsOnLine[0]?.[0]).toBe(2);
    expect(segsOnLine[0]?.[3]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// defineProps<T>() macro
// ---------------------------------------------------------------------------

describe("defineProps macro", () => {
  it("uses the destructuring and type as the component function signature", () => {
    const { code } = parseAndGenerate(
      src(
        "<script setup>",
        "const { name } = defineProps<{ name: string }>()",
        "</script>",
        "<template><div>{name}</div></template>"
      )
    );
    expect(code).toContain("__RsfcComponent__({ name }: { name: string })");
  });

  it("removes the defineProps call from the function body", () => {
    const { code } = parseAndGenerate(
      src(
        "<script setup>",
        "const { label } = defineProps<{ label: string }>()",
        "</script>"
      )
    );
    expect(code).not.toContain("defineProps");
  });

  it("preserves other setup body lines after removing defineProps", () => {
    const { code } = parseAndGenerate(
      src(
        "<script setup>",
        "import { useState } from 'react'",
        "const { title } = defineProps<{ title: string }>()",
        "const [count, setCount] = useState(0)",
        "</script>",
        "<template><div>{title} {count}</div></template>"
      )
    );
    expect(code).toContain("useState");
    expect(code).toContain("count");
    expect(code).not.toContain("defineProps");
  });

  it("supports destructuring with default values in the signature", () => {
    const { code } = parseAndGenerate(
      src(
        "<script setup>",
        "const { count = 0 } = defineProps<{ count?: number }>()",
        "</script>"
      )
    );
    expect(code).toContain("{ count = 0 }: { count?: number }");
  });

  it("supports a simple identifier (non-destructuring) pattern", () => {
    const { code } = parseAndGenerate(
      src(
        "<script setup>",
        "const props = defineProps<{ id: string }>()",
        "</script>"
      )
    );
    expect(code).toContain("props: { id: string }");
  });

  it("generates a plain () signature when defineProps is absent", () => {
    const { code } = parseAndGenerate(
      src("<script setup>", "const x = 1", "</script>")
    );
    expect(code).toContain("__RsfcComponent__()");
  });

  it("handles multi-line type argument in defineProps", () => {
    const { code } = parseAndGenerate(
      src(
        "<script setup lang=\"ts\">",
        "const { name, role } = defineProps<{",
        "  name: string",
        "  role: string",
        "}>()",
        "</script>",
        "<template><span>{name}</span></template>"
      )
    );
    expect(code).toContain("{ name, role }: { name: string; role: string }");
    expect(code).not.toContain("defineProps");
  });

  it("handles multi-line type with nested generics", () => {
    const { code } = parseAndGenerate(
      src(
        "<script setup lang=\"ts\">",
        "const { items } = defineProps<{",
        "  items: Array<string>",
        "}>()",
        "</script>"
      )
    );
    expect(code).toContain("items: Array<string>");
    expect(code).not.toContain("defineProps");
  });

  it("skips all consumed lines when defineProps spans multiple lines", () => {
    const { code } = parseAndGenerate(
      src(
        "<script setup lang=\"ts\">",
        "const x = 1",
        "const { label } = defineProps<{",
        "  label: string",
        "}>()",
        "const y = 2",
        "</script>"
      )
    );
    // Only the defineProps lines should be removed; x and y must remain
    expect(code).toContain("const x = 1");
    expect(code).toContain("const y = 2");
    expect(code).not.toContain("defineProps");
    // Type ends up in the function signature, not as a standalone body statement
    expect(code).toContain("{ label }: { label: string }");
  });
});
