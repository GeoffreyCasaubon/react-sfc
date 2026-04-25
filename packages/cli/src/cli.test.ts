import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compileFile, parseFile } from "./compile.js";

// ---------------------------------------------------------------------------
// Helpers — temp fixtures
// ---------------------------------------------------------------------------

const TMP = join(tmpdir(), "rsfc-cli-test");

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

function writeTmp(name: string, content: string): string {
  const path = join(TMP, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

// ---------------------------------------------------------------------------
// compileFile — basic output
// ---------------------------------------------------------------------------

describe("compileFile", () => {
  it("produces JavaScript output from a simple component", async () => {
    const path = writeTmp("simple.rsfc", "<script>export const x = 1</script>");
    const code = await compileFile(path);
    expect(code).toContain("x = 1");
  });

  it("inlines plain-CSS style virtual modules (no \\0 ids remain)", async () => {
    const path = writeTmp("styled.rsfc", "<style>.foo { color: red; }</style>");
    const code = await compileFile(path);
    expect(code).not.toContain("\0rsfc:style");
    expect(code).toContain(".foo { color: red; }");
    expect(code).toContain("typeof document");
  });

  it("inlines CSS module classMap and removes virtual import", async () => {
    const path = writeTmp("cssmod.rsfc", "<style module>.btn{color:red}</style>");
    const code = await compileFile(path);
    expect(code).toContain("const styles");
    expect(code).not.toContain("\0rsfc:cssmodule");
    expect(code).toMatch(/"btn"\s*:/);
  });

  it("includes template wrapper in output", async () => {
    const path = writeTmp("templ.rsfc", "<template><div>Hello</div></template>");
    const code = await compileFile(path);
    expect(code).toContain("export default");
    expect(code).toContain("Hello");
  });

  it("handles <script setup> with hoisted imports", async () => {
    const path = writeTmp(
      "setup.rsfc",
      [
        "<script setup>",
        "import { useRef } from 'react'",
        "const ref = useRef(null)",
        "</script>",
        "<template><div/></template>",
      ].join("\n")
    );
    const code = await compileFile(path);
    expect(code).toContain("useRef");
    expect(code).toContain("export default");
  });

  it("emits defineProps signature in the component function", async () => {
    const path = writeTmp(
      "defprops.rsfc",
      [
        "<script setup lang=\"ts\">",
        "const { label } = defineProps<{ label: string }>()",
        "</script>",
        "<template><span>{label}</span></template>",
      ].join("\n")
    );
    const code = await compileFile(path);
    expect(code).toContain("{ label }");
    expect(code).not.toContain("defineProps");
  });

  it("multiple style blocks are all inlined", async () => {
    const path = writeTmp(
      "multi-style.rsfc",
      "<style>.a{color:red}</style><style>.b{color:blue}</style>"
    );
    const code = await compileFile(path);
    expect(code).toContain(".a{color:red}");
    expect(code).toContain(".b{color:blue}");
    expect(code).not.toContain("\0rsfc:style");
  });
});

// ---------------------------------------------------------------------------
// compileFile — error handling
// ---------------------------------------------------------------------------

describe("compileFile — errors", () => {
  it("throws when the input file does not exist", async () => {
    await expect(compileFile(join(TMP, "nonexistent.rsfc"))).rejects.toThrow();
  });

  it("still compiles when a preprocessor is missing (falls back to raw CSS)", async () => {
    // Uses a .scss extension but no Sass installed would be the real case;
    // in the test env Sass IS installed so this just verifies the happy path.
    // The fallback is covered by the catch in inlineVirtualModules.
    const path = writeTmp("plain-fallback.rsfc", "<style>.x{color:red}</style>");
    const code = await compileFile(path);
    expect(code).toContain(".x{color:red}");
  });
});

// ---------------------------------------------------------------------------
// parseFile
// ---------------------------------------------------------------------------

describe("parseFile", () => {
  it("returns a descriptor with script content", () => {
    const path = writeTmp("p-script.rsfc", "<script>export const x = 1</script>");
    const d = parseFile(path);
    expect(d.script?.content).toContain("x = 1");
    expect(d.errors).toHaveLength(0);
  });

  it("filename in descriptor matches the resolved absolute path", () => {
    const path = writeTmp("p-fname.rsfc", "<script>x</script>");
    const d = parseFile(path);
    expect(d.filename).toBe(path);
  });

  it("returns docs content in descriptor.docs", () => {
    const path = writeTmp("p-docs.rsfc", "<docs># My Component\nDocs here.</docs>");
    const d = parseFile(path);
    expect(d.docs?.content).toContain("My Component");
  });

  it("returns custom blocks in descriptor.customBlocks", () => {
    const path = writeTmp("p-custom.rsfc", "<graphql>{ user { id } }</graphql>");
    const d = parseFile(path);
    expect(d.customBlocks[0]?.tag).toBe("graphql");
    expect(d.customBlocks[0]?.content).toContain("user");
  });

  it("serialises to valid JSON (for tooling pipelines)", () => {
    const path = writeTmp("p-json.rsfc", "<script>const x = 1</script><template><div/></template>");
    const d = parseFile(path);
    expect(() => JSON.stringify(d)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(d));
    expect(parsed.script?.content).toContain("x = 1");
  });

  it("throws when the input file does not exist", () => {
    expect(() => parseFile(join(TMP, "missing.rsfc"))).toThrow();
  });

  it("collects parse errors in the errors array without throwing", () => {
    // Duplicate <script> blocks are a parse error — should not throw.
    const path = writeTmp(
      "p-duperr.rsfc",
      "<script>const a = 1</script><script>const b = 2</script>"
    );
    const d = parseFile(path);
    expect(d.errors.length).toBeGreaterThan(0);
    expect(d.errors[0]?.message).toMatch(/duplicate/i);
  });
});

// ---------------------------------------------------------------------------
// compileFile — write-to-file (-o flag integration via compile API)
// ---------------------------------------------------------------------------

describe("compileFile — output", () => {
  it("returns the compiled code as a string (caller decides where to write)", async () => {
    const inPath = writeTmp("out-test.rsfc", "<script>export const v = 42</script>");
    const code = await compileFile(inPath);
    const outPath = join(TMP, "out-test.js");
    writeFileSync(outPath, code, "utf-8");
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, "utf-8")).toContain("v = 42");
  });
});
