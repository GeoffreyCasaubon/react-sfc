import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
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
// compileFile
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
});
