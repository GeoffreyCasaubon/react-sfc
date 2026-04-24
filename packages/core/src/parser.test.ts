import { describe, it, expect } from "vitest";
import { parse } from "./parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function src(...lines: string[]): string {
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Empty / trivial inputs
// ---------------------------------------------------------------------------

describe("empty file", () => {
  it("returns an empty descriptor with no errors", () => {
    const result = parse("", { filename: "test.rsfc" });
    expect(result.filename).toBe("test.rsfc");
    expect(result.source).toBe("");
    expect(result.script).toBeNull();
    expect(result.clientScript).toBeNull();
    expect(result.template).toBeNull();
    expect(result.styles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("returns empty descriptor for whitespace-only file", () => {
    const result = parse("   \n\n  ", { filename: "blank.rsfc" });
    expect(result.script).toBeNull();
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Single block — kind
// ---------------------------------------------------------------------------

describe("single block", () => {
  it("parses a <script> block", () => {
    const source = src("<script>", "export default {}", "</script>");
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.script).not.toBeNull();
    expect(result.script?.kind).toBe("script");
    expect(result.script?.content).toBe("\nexport default {}\n");
    expect(result.errors).toHaveLength(0);
  });

  it("parses a <clientScript> block", () => {
    const source = src(
      "<clientScript>",
      'import { useState } from "react"',
      "</clientScript>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.clientScript).not.toBeNull();
    expect(result.clientScript?.kind).toBe("clientScript");
    expect(result.clientScript?.content).toContain("useState");
  });

  it("parses a <template> block", () => {
    const source = src("<template>", "<div>Hello</div>", "</template>");
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.template).not.toBeNull();
    expect(result.template?.kind).toBe("template");
    expect(result.template?.content).toBe("\n<div>Hello</div>\n");
  });

  it("parses a <style> block", () => {
    const source = src("<style>", ".foo { color: red; }", "</style>");
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.styles).toHaveLength(1);
    expect(result.styles[0]?.kind).toBe("style");
    expect(result.styles[0]?.content).toBe("\n.foo { color: red; }\n");
  });
});

// ---------------------------------------------------------------------------
// Attributes — lang, scoped, arbitrary
// ---------------------------------------------------------------------------

describe("attributes", () => {
  it("parses lang attribute on <script>", () => {
    const source = '<script lang="ts">\nconst x: number = 1\n</script>';
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.script?.lang).toBe("ts");
    expect(result.script?.attrs).not.toHaveProperty("lang");
  });

  it("parses lang attribute with single quotes", () => {
    const source = "<script lang='tsx'>\nconst x = 1\n</script>";
    const result = parse(source, { filename: "a.rsfc" });
    expect(result.script?.lang).toBe("tsx");
  });

  it("parses scoped as a boolean attribute on <style>", () => {
    const source = "<style scoped>\n.foo {}\n</style>";
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.styles[0]?.attrs["scoped"]).toBe(true);
    expect(result.styles[0]?.lang).toBeUndefined();
  });

  it("parses both lang and scoped on <style>", () => {
    const source = '<style lang="scss" scoped>\n.foo {}\n</style>';
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.styles[0]?.lang).toBe("scss");
    expect(result.styles[0]?.attrs["scoped"]).toBe(true);
    expect(result.styles[0]?.attrs).not.toHaveProperty("lang");
  });

  it("parses multiple arbitrary attributes", () => {
    const source = '<script module="esm" data-src="./foo">\n</script>';
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.script?.attrs["module"]).toBe("esm");
    expect(result.script?.attrs["data-src"]).toBe("./foo");
  });

  it("does not set lang when absent", () => {
    const source = "<script>\nconst x = 1\n</script>";
    const result = parse(source, { filename: "a.rsfc" });
    expect(result.script?.lang).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Multiple blocks
// ---------------------------------------------------------------------------

describe("multiple blocks", () => {
  it("parses all four block types together", () => {
    const source = src(
      "<script>",
      "export default {}",
      "</script>",
      "<clientScript>",
      "// client",
      "</clientScript>",
      "<template>",
      "<div />",
      "</template>",
      "<style>",
      ".foo {}",
      "</style>"
    );
    const result = parse(source, { filename: "full.rsfc" });

    expect(result.script).not.toBeNull();
    expect(result.clientScript).not.toBeNull();
    expect(result.template).not.toBeNull();
    expect(result.styles).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("collects multiple <style> blocks in source order", () => {
    const source = src(
      "<style>",
      ".base {}",
      "</style>",
      "<style lang=\"scss\">",
      ".theme {}",
      "</style>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.styles).toHaveLength(2);
    expect(result.styles[0]?.content).toContain(".base");
    expect(result.styles[1]?.content).toContain(".theme");
    expect(result.styles[1]?.lang).toBe("scss");
  });
});

// ---------------------------------------------------------------------------
// startLine tracking
// ---------------------------------------------------------------------------

describe("startLine", () => {
  it("startLine is 0 for a block on the first line", () => {
    const source = "<script>\ncode\n</script>";
    const result = parse(source, { filename: "a.rsfc" });
    // content starts right after <script> which is on line 0
    expect(result.script?.startLine).toBe(0);
  });

  it("startLine reflects the line where the opening tag ends", () => {
    const source = src(
      "// preamble line 0",
      "// preamble line 1",
      "<script>",
      "code",
      "</script>"
    );
    // <script> tag itself ends on line 2; content starts on line 2
    const result = parse(source, { filename: "a.rsfc" });
    expect(result.script?.startLine).toBe(2);
  });

  it("second block has higher startLine than first", () => {
    const source = src(
      "<script>",
      "code",
      "</script>",
      "<style>",
      ".foo {}",
      "</style>"
    );
    const result = parse(source, { filename: "a.rsfc" });
    const scriptLine = result.script?.startLine ?? -1;
    const styleLine = result.styles[0]?.startLine ?? -1;
    expect(styleLine).toBeGreaterThan(scriptLine);
  });
});

// ---------------------------------------------------------------------------
// Template with nested HTML tags
// ---------------------------------------------------------------------------

describe("template with nested content", () => {
  it("does not interpret nested <div> as a block", () => {
    const source = src(
      "<template>",
      "<div><p>nested</p></div>",
      "</template>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.template).not.toBeNull();
    expect(result.template?.content).toContain("<div>");
    expect(result.errors).toHaveLength(0);
  });

  it("handles JSX-style template content", () => {
    const source = src(
      "<template>",
      "<>{items.map(i => <Item key={i.id} />)}</>",
      "</template>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.template?.content).toContain("items.map");
  });

  it("does not treat nested <style> inside template as a top-level style block", () => {
    const source = src(
      "<template>",
      "<style>.nested {}</style>",
      "</template>",
      "<style>",
      ".actual {}",
      "</style>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    // Only one style block (the top-level one), not the one inside template
    expect(result.styles).toHaveLength(1);
    expect(result.styles[0]?.content).toContain(".actual");
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("error cases", () => {
  it("reports an error for a duplicate <script> block and keeps the first", () => {
    const source = src(
      "<script>",
      "first",
      "</script>",
      "<script>",
      "second",
      "</script>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/[Dd]uplicate.*script/);
    expect(result.script?.content).toContain("first");
  });

  it("reports an error for a duplicate <template> block and keeps the first", () => {
    const source = src(
      "<template>",
      "<div>first</div>",
      "</template>",
      "<template>",
      "<div>second</div>",
      "</template>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/[Dd]uplicate.*template/);
    expect(result.template?.content).toContain("first");
  });

  it("reports an error for a duplicate <clientScript> block", () => {
    const source = src(
      "<clientScript>a</clientScript>",
      "<clientScript>b</clientScript>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.errors).toHaveLength(1);
    expect(result.clientScript?.content).toBe("a");
  });

  it("reports an error for a missing closing tag", () => {
    const source = "<script>\nno closing tag";
    const result = parse(source, { filename: "a.rsfc" });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toMatch(/closing tag.*script/i);
    expect(result.script).toBeNull();
  });

  it("continues parsing after a missing closing tag error", () => {
    const source = src(
      "<script>",
      "no close",
      "<style>",
      ".foo {}",
      "</style>"
    );
    const result = parse(source, { filename: "a.rsfc" });

    // style block still parsed even though script had no close
    expect(result.styles).toHaveLength(1);
    expect(result.errors.some((e) => e.message.match(/script/))).toBe(true);
  });

  it("does not throw on malformed input — returns errors array", () => {
    expect(() =>
      parse("<<<garbage>>>", { filename: "bad.rsfc" })
    ).not.toThrow();
  });
});
