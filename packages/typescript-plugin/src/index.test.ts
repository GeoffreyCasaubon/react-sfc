import { describe, it, expect } from "vitest";
import { makeVirtualContent } from "./virtual.js";

// ---------------------------------------------------------------------------
// makeVirtualContent — virtual .tsx generation from .rsfc files
// ---------------------------------------------------------------------------

function fromSource(source: string): string | undefined {
  return makeVirtualContent("/test.rsfc", () => source);
}

describe("makeVirtualContent — <script>", () => {
  it("returns script block content verbatim", () => {
    const result = fromSource(
      "<script lang=\"ts\">\nexport default function Foo() { return null }\n</script>"
    );
    expect(result).toContain("export default function Foo");
    expect(result).not.toContain("<script");
  });

  it("includes exported interface from script block", () => {
    const result = fromSource(
      "<script lang=\"ts\">\nexport interface Props { name: string }\nexport default function C(p: Props) { return null }\n</script>"
    );
    expect(result).toContain("export interface Props");
    expect(result).toContain("export default function C");
  });
});

describe("makeVirtualContent — <script setup>", () => {
  it("wraps setup in an exported component function", () => {
    const result = fromSource(
      "<script setup lang=\"ts\">\nconst x = 1\n</script>"
    );
    expect(result).toContain("export default function Component");
    expect(result).toContain("React.ReactElement");
  });

  it("hoists import statements to module level", () => {
    const result = fromSource([
      "<script setup lang=\"ts\">",
      "import { useState } from \"react\"",
      "const [count, setCount] = useState(0)",
      "</script>",
    ].join("\n"));
    // import must appear before the function declaration
    const importIdx = result!.indexOf("import { useState }");
    const funcIdx = result!.indexOf("export default function");
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeLessThan(funcIdx);
  });

  it("extracts defineProps<T>() as the function signature", () => {
    const result = fromSource([
      "<script setup lang=\"ts\">",
      "const { name, age } = defineProps<{ name: string; age?: number }>()",
      "</script>",
    ].join("\n"));
    expect(result).toContain("{ name, age }: { name: string; age?: number }");
    expect(result).not.toContain("defineProps");
  });

  it("removes defineProps line from the function body", () => {
    const result = fromSource([
      "<script setup lang=\"ts\">",
      "import { useState } from \"react\"",
      "const { label } = defineProps<{ label: string }>()",
      "const [count, setCount] = useState(0)",
      "</script>",
    ].join("\n"));
    expect(result).toContain("useState");
    expect(result).toContain("count");
    expect(result).not.toContain("defineProps");
  });

  it("uses 'interface Props' as fallback when no defineProps", () => {
    const result = fromSource([
      "<script setup lang=\"ts\">",
      "interface Props { title: string }",
      "const x = 1",
      "</script>",
    ].join("\n"));
    expect(result).toContain("props: Props");
    expect(result).toContain("interface Props");
  });

  it("falls back to Record<string, unknown> when no props detection", () => {
    const result = fromSource(
      "<script setup lang=\"ts\">\nconst x = 1\n</script>"
    );
    // No props signature — empty params
    expect(result).toContain("function Component()");
  });

  it("handles multi-line defineProps type argument", () => {
    const result = fromSource([
      "<script setup lang=\"ts\">",
      "const { name, role } = defineProps<{",
      "  name: string",
      "  role: string",
      "}>()",
      "</script>",
    ].join("\n"));
    expect(result).toContain("{ name, role }: { name: string; role: string }");
    expect(result).not.toContain("defineProps");
  });

  it("skips all multi-line defineProps lines from the function body", () => {
    const result = fromSource([
      "<script setup lang=\"ts\">",
      "import { useState } from \"react\"",
      "const { label } = defineProps<{",
      "  label: string",
      "}>()",
      "const x = 1",
      "</script>",
    ].join("\n"));
    expect(result).toContain("useState");
    expect(result).toContain("const x = 1");
    expect(result).not.toContain("defineProps");
    // Type ends up in the function signature, not as a standalone body statement
    expect(result).toContain("{ label }: { label: string }");
  });
});

describe("makeVirtualContent — no script", () => {
  it("returns an empty FC for files with no script block", () => {
    const result = fromSource(
      "<template>\n<div>Hello</div>\n</template>\n<style>.x { color: red }</style>"
    );
    expect(result).toContain("export default function Component");
    expect(result).toContain("React.ReactElement");
  });
});

describe("makeVirtualContent — error handling", () => {
  it("returns undefined when the file does not exist", () => {
    const result = makeVirtualContent("/nonexistent.rsfc", () => undefined);
    expect(result).toBeUndefined();
  });
});
