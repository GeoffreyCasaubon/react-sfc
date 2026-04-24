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
  clientScript: null,
  template: null,
  styles: [],
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

  it("virtual module id follows the \\0rsfc:style:<filename>:<index> convention", () => {
    const source = src("<style>.foo{}</style>");
    const { virtualModules } = parseAndGenerate(source, "/path/comp.rsfc");
    expect(virtualModules[0]?.id).toBe("\0rsfc:style:/path/comp.rsfc:0");
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
    // Plain CSS block — no extension suffix
    expect(virtualModules[0]?.id).toBe("\0rsfc:style:/a.rsfc:0");
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
// Source map mappings sanity
// ---------------------------------------------------------------------------

describe("source map mappings", () => {
  it("mappings string is non-empty when there is content to map", () => {
    const source = src("<script>", "const x = 1", "</script>");
    const { map } = parseAndGenerate(source);
    // At minimum there should be semicolons (line separators)
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  it("mappings has at least as many semicolons as generated lines minus one", () => {
    const source = src("<script>", "line1", "line2", "line3", "</script>");
    const { map, code } = parseAndGenerate(source);
    const generatedLineCount = code.split("\n").length;
    const separatorCount = map.mappings.split(";").length;
    // mappings.split(";").length === number of generated lines
    expect(separatorCount).toBe(generatedLineCount);
  });
});
