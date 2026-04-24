import { describe, it, expect, vi } from "vitest";
import type { Plugin } from "vite";
import rsfcPlugin from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function src(...lines: string[]): string {
  return lines.join("\n");
}

/**
 * Extract the hook function from an ObjectHook (which can be either a plain
 * function or { handler, order? }).
 */
function getHook<T>(hook: T | { handler: T } | undefined): T | undefined {
  if (hook === undefined || hook === null) return undefined;
  if (typeof hook === "function") return hook;
  if (typeof hook === "object" && "handler" in (hook as object)) {
    return (hook as { handler: T }).handler;
  }
  return undefined;
}

/** Call plugin.transform with a minimal this-context. */
function callTransform(
  plugin: Plugin,
  code: string,
  id: string,
  ctx = { warn: vi.fn(), error: vi.fn() }
) {
  const fn = getHook(plugin.transform);
  if (fn === undefined) throw new Error("plugin.transform is not defined");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).call(ctx, code, id) as ReturnType<typeof fn>;
}

function callResolveId(plugin: Plugin, id: string) {
  const fn = getHook(plugin.resolveId);
  if (fn === undefined) throw new Error("plugin.resolveId is not defined");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).call({}, id, undefined) as ReturnType<typeof fn>;
}

function callLoad(plugin: Plugin, id: string) {
  const fn = getHook(plugin.load);
  if (fn === undefined) throw new Error("plugin.load is not defined");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).call({}, id) as ReturnType<typeof fn>;
}

// ---------------------------------------------------------------------------
// Plugin metadata
// ---------------------------------------------------------------------------

describe("plugin shape", () => {
  it("returns a plugin with name vite-plugin-rsfc", () => {
    const plugin = rsfcPlugin();
    expect(plugin.name).toBe("vite-plugin-rsfc");
  });

  it("enforce is 'pre'", () => {
    expect(rsfcPlugin().enforce).toBe("pre");
  });

  it("exposes transform, resolveId, and load hooks", () => {
    const plugin = rsfcPlugin();
    expect(plugin.transform).toBeDefined();
    expect(plugin.resolveId).toBeDefined();
    expect(plugin.load).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// transform — file filtering
// ---------------------------------------------------------------------------

describe("transform — file filtering", () => {
  it("returns null for non-.rsfc files", () => {
    const plugin = rsfcPlugin();
    expect(callTransform(plugin, "const x = 1", "/src/foo.ts")).toBeNull();
    expect(callTransform(plugin, "<div/>", "/src/Comp.tsx")).toBeNull();
    expect(callTransform(plugin, ".foo{}", "/src/style.css")).toBeNull();
  });

  it("processes .rsfc files", () => {
    const plugin = rsfcPlugin();
    const result = callTransform(
      plugin,
      "<script>export const x = 1</script>",
      "/src/Comp.rsfc"
    );
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// transform — generated code
// ---------------------------------------------------------------------------

describe("transform — generated code", () => {
  it("includes script block content", () => {
    const plugin = rsfcPlugin();
    const source = src("<script>", "export const answer = 42", "</script>");
    const result = callTransform(plugin, source, "/a.rsfc");
    expect((result as { code: string }).code).toContain("export const answer = 42");
  });

  it("wraps template in a default export", () => {
    const plugin = rsfcPlugin();
    const source = src("<template>", "<div>Hello</div>", "</template>");
    const result = callTransform(plugin, source, "/a.rsfc");
    expect((result as { code: string }).code).toContain("export default");
    expect((result as { code: string }).code).toContain("<div>Hello</div>");
  });

  it("includes import statements for style virtual modules", () => {
    const plugin = rsfcPlugin();
    const source = src("<style>.foo{}</style>");
    const result = callTransform(plugin, source, "/a.rsfc");
    expect((result as { code: string }).code).toContain("rsfc:style:/a.rsfc:0");
  });

  it("handles all four blocks together", () => {
    const plugin = rsfcPlugin();
    const source = src(
      "<script>export async function loader() {}</script>",
      "<clientScript>import { useState } from 'react'</clientScript>",
      "<template><main/></template>",
      "<style>.x{}</style>"
    );
    const result = callTransform(plugin, source, "/page.rsfc") as { code: string };
    expect(result.code).toContain("loader");
    expect(result.code).toContain("useState");
    expect(result.code).toContain("export default");
    expect(result.code).toContain("rsfc:style:/page.rsfc:0");
  });
});

// ---------------------------------------------------------------------------
// transform — source map
// ---------------------------------------------------------------------------

describe("transform — source map", () => {
  it("returns a map alongside the code", () => {
    const plugin = rsfcPlugin();
    const source = src("<script>const x = 1</script>");
    const result = callTransform(plugin, source, "/a.rsfc") as {
      code: string;
      map: unknown;
    };
    expect(result.map).toBeDefined();
    expect(result.map).not.toBeNull();
  });

  it("map has version 3", () => {
    const plugin = rsfcPlugin();
    const result = callTransform(
      plugin,
      "<script>x</script>",
      "/a.rsfc"
    ) as { map: { version: number } };
    expect(result.map.version).toBe(3);
  });

  it("map.sources contains the file id", () => {
    const plugin = rsfcPlugin();
    const result = callTransform(
      plugin,
      "<script>x</script>",
      "/my/comp.rsfc"
    ) as { map: { sources: string[] } };
    expect(result.map.sources).toContain("/my/comp.rsfc");
  });
});

// ---------------------------------------------------------------------------
// transform — parse errors
// ---------------------------------------------------------------------------

describe("transform — parse errors become warnings", () => {
  it("warns instead of throwing when the descriptor has errors", () => {
    const plugin = rsfcPlugin();
    const ctx = { warn: vi.fn(), error: vi.fn() };
    // Missing closing tag → parse error
    const result = callTransform(plugin, "<script>no close", "/a.rsfc", ctx);
    // Still returns output (resilient transform)
    expect(result).not.toBeNull();
    // And emits a warning for the parse error
    expect(ctx.warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolveId
// ---------------------------------------------------------------------------

describe("resolveId", () => {
  it("returns null for unknown ids", () => {
    const plugin = rsfcPlugin();
    expect(callResolveId(plugin, "/some/other/file.ts")).toBeNull();
    expect(callResolveId(plugin, "react")).toBeNull();
  });

  it("returns the id for virtual modules registered during transform", () => {
    const plugin = rsfcPlugin();
    // Run transform first to register the virtual module
    callTransform(plugin, "<style>.foo{}</style>", "/comp.rsfc");
    const vmId = "\0rsfc:style:/comp.rsfc:0";
    expect(callResolveId(plugin, vmId)).toBe(vmId);
  });

  it("does not resolve ids from other plugin instances", () => {
    const plugin1 = rsfcPlugin();
    const plugin2 = rsfcPlugin();
    callTransform(plugin1, "<style>.foo{}</style>", "/comp.rsfc");
    const vmId = "\0rsfc:style:/comp.rsfc:0";
    // plugin2 never saw this file → should not resolve it
    expect(callResolveId(plugin2, vmId)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

describe("load", () => {
  it("returns null for unknown ids", () => {
    const plugin = rsfcPlugin();
    expect(callLoad(plugin, "/some/file.ts")).toBeNull();
  });

  it("returns the style code for a registered virtual module", () => {
    const plugin = rsfcPlugin();
    callTransform(plugin, "<style>\n.foo { color: red; }\n</style>", "/comp.rsfc");
    const vmId = "\0rsfc:style:/comp.rsfc:0";
    const result = callLoad(plugin, vmId) as { code: string };
    expect(result.code).toContain(".foo { color: red; }");
  });

  it("returns code for each of multiple style blocks", () => {
    const plugin = rsfcPlugin();
    callTransform(
      plugin,
      src("<style>.base{}</style>", "<style>.theme{}</style>"),
      "/comp.rsfc"
    );
    const r0 = callLoad(plugin, "\0rsfc:style:/comp.rsfc:0") as { code: string };
    const r1 = callLoad(plugin, "\0rsfc:style:/comp.rsfc:1") as { code: string };
    expect(r0.code).toContain(".base");
    expect(r1.code).toContain(".theme");
  });

  it("virtual modules are isolated per plugin instance", () => {
    const plugin1 = rsfcPlugin();
    const plugin2 = rsfcPlugin();
    callTransform(plugin1, "<style>.foo{}</style>", "/comp.rsfc");
    // plugin2 never processed this file
    expect(callLoad(plugin2, "\0rsfc:style:/comp.rsfc:0")).toBeNull();
  });
});
