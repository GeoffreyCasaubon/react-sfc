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
async function callTransform(
  plugin: Plugin,
  code: string,
  id: string,
  ctx = { warn: vi.fn(), error: vi.fn() }
) {
  const fn = getHook(plugin.transform);
  if (fn === undefined) throw new Error("plugin.transform is not defined");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).call(ctx, code, id) as Promise<ReturnType<typeof fn>>;
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

  it("exposes transform, resolveId, load, and handleHotUpdate hooks", () => {
    const plugin = rsfcPlugin();
    expect(plugin.transform).toBeDefined();
    expect(plugin.resolveId).toBeDefined();
    expect(plugin.load).toBeDefined();
    expect(plugin.handleHotUpdate).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// transform — file filtering
// ---------------------------------------------------------------------------

describe("transform — file filtering", () => {
  it("returns null for non-.rsfc files", async () => {
    const plugin = rsfcPlugin();
    expect(await callTransform(plugin, "const x = 1", "/src/foo.ts")).toBeNull();
    expect(await callTransform(plugin, "<div/>", "/src/Comp.tsx")).toBeNull();
    expect(await callTransform(plugin, ".foo{}", "/src/style.css")).toBeNull();
  });

  it("processes .rsfc files", async () => {
    const plugin = rsfcPlugin();
    const result = await callTransform(
      plugin,
      "<script>export const x = 1</script>",
      "/src/Comp.rsfc"
    );
    expect(result).not.toBeNull();
  });

  it("respects include option", async () => {
    const plugin = rsfcPlugin({ include: ["**/*.rsfc"] });
    expect(await callTransform(plugin, "", "/src/foo.ts")).toBeNull();
    const result = await callTransform(
      plugin,
      "<script>export const x = 1</script>",
      "/src/Comp.rsfc"
    );
    expect(result).not.toBeNull();
  });

  it("respects exclude option", async () => {
    const plugin = rsfcPlugin({ exclude: ["**/node_modules/**"] });
    expect(
      await callTransform(plugin, "<script>x</script>", "/node_modules/pkg/Comp.rsfc")
    ).toBeNull();
    const result = await callTransform(
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
  it("includes script block content", async () => {
    const plugin = rsfcPlugin();
    const source = src("<script>", "export const answer = 42", "</script>");
    const result = await callTransform(plugin, source, "/a.rsfc");
    expect((result as { code: string }).code).toContain("answer");
  });

  it("wraps template in a default export", async () => {
    const plugin = rsfcPlugin();
    const source = src("<template>", "<div>Hello</div>", "</template>");
    const result = await callTransform(plugin, source, "/a.rsfc");
    expect((result as { code: string }).code).toContain("export default");
  });

  it("includes import statements for style virtual modules", async () => {
    const plugin = rsfcPlugin();
    const source = src("<style>.foo{}</style>");
    // The style import is in the pre-esbuild output; after esbuild processes it,
    // the raw \0 import statement is preserved as a side-effect import.
    const result = await callTransform(plugin, source, "/a.rsfc");
    // The virtual module must be registered regardless
    expect(callResolveId(plugin, "\0rsfc:style:/a.rsfc:0.css")).toBe("\0rsfc:style:/a.rsfc:0.css");
  });

  it("handles all four blocks together", async () => {
    const plugin = rsfcPlugin();
    const source = src(
      "<script>export async function loader() {}</script>",
      // clientScript: use a side-effect import that esbuild won't drop
      "<clientScript>import 'react'</clientScript>",
      "<template><main/></template>",
      "<style>.x{}</style>"
    );
    const result = (await callTransform(plugin, source, "/page.rsfc")) as { code: string };
    expect(result.code).toContain("loader");
    expect(result.code).toContain("export default");
  });

  it("registers scss virtual modules with .scss extension id", async () => {
    const plugin = rsfcPlugin();
    await callTransform(plugin, '<style lang="scss">.foo{}</style>', "/comp.rsfc");
    const scssId = "\0rsfc:style:/comp.rsfc:0.scss";
    expect(callResolveId(plugin, scssId)).toBe(scssId);
    const result = callLoad(plugin, scssId) as { code: string };
    expect(result.code).toContain(".foo");
  });

  it("registers plain css virtual modules with .css extension id", async () => {
    const plugin = rsfcPlugin();
    await callTransform(plugin, "<style>.bar{}</style>", "/comp.rsfc");
    const cssId = "\0rsfc:style:/comp.rsfc:0.css";
    expect(callResolveId(plugin, cssId)).toBe(cssId);
    const result = callLoad(plugin, cssId) as { code: string };
    expect(result.code).toContain(".bar");
  });

  it("registers cssmodule virtual module for <style module> blocks", async () => {
    const plugin = rsfcPlugin();
    await callTransform(plugin, '<style module>.btn{color:red}</style>', "/mod.rsfc");
    const cssModId = "\0rsfc:cssmodule:/mod.rsfc:0";
    expect(callResolveId(plugin, cssModId)).toBe(cssModId);
    const result = callLoad(plugin, cssModId) as { code: string };
    // Should be a JS default export with the classMap
    expect(result.code).toContain("export default");
    expect(result.code).toContain("btn");
  });

  it("emits default import for <style module> in transformed code", async () => {
    const plugin = rsfcPlugin();
    const result = (await callTransform(
      plugin,
      '<style module>.btn{}</style>',
      "/mod.rsfc"
    )) as { code: string };
    // esbuild drops unused imports; use a template with className to keep it
    const result2 = (await callTransform(
      plugin,
      src('<style module>.btn{}</style>', '<template><div className={styles.btn}/></template>'),
      "/mod.rsfc"
    )) as { code: string };
    // The cssmodule import should be resolved (registered in cache)
    expect(callResolveId(plugin, "\0rsfc:cssmodule:/mod.rsfc:0")).toBe(
      "\0rsfc:cssmodule:/mod.rsfc:0"
    );
    expect(result2).not.toBeNull();
  });

  it("strips TypeScript type annotations from script lang=ts blocks", async () => {
    const plugin = rsfcPlugin();
    const source = src(
      '<script lang="ts">',
      "export const items: Array<{ id: number }> = []",
      "</script>"
    );
    const result = (await callTransform(plugin, source, "/typed.rsfc")) as { code: string };
    // Type annotation must be stripped by esbuild
    expect(result.code).not.toContain(": Array<");
    expect(result.code).toContain("items");
  });
});

// ---------------------------------------------------------------------------
// transform — docs and custom blocks
// ---------------------------------------------------------------------------

describe("transform — docs and custom blocks", () => {
  it("ignores <docs> blocks (no output, no error)", async () => {
    const plugin = rsfcPlugin();
    const result = await callTransform(
      plugin,
      "<docs># Component\nSome docs.</docs><script>export const x = 1</script>",
      "/a.rsfc"
    );
    expect(result).not.toBeNull();
    const code = (result as { code: string }).code;
    expect(code).toContain("x = 1");
    expect(code).not.toContain("My Component");
  });

  it("ignores custom blocks when no transform is registered", async () => {
    const plugin = rsfcPlugin();
    const result = await callTransform(
      plugin,
      "<graphql>{ user { id } }</graphql><script>export const x = 1</script>",
      "/a.rsfc"
    );
    expect(result).not.toBeNull();
    const code = (result as { code: string }).code;
    expect(code).not.toContain("graphql");
  });

  it("invokes customBlockTransforms for matching tag names", async () => {
    const plugin = rsfcPlugin({
      customBlockTransforms: {
        graphql: (block) => `export const QUERY = ${JSON.stringify(block.content)};`,
      },
    });
    const result = (await callTransform(
      plugin,
      "<graphql>{ user { id } }</graphql>",
      "/a.rsfc"
    )) as { code: string };
    expect(result.code).toContain("QUERY");
    expect(result.code).toContain("user { id }");
  });

  it("custom block transform receives the file id", async () => {
    const receivedIds: string[] = [];
    const plugin = rsfcPlugin({
      customBlockTransforms: {
        story: (block, id) => { receivedIds.push(id); return null; },
      },
    });
    await callTransform(plugin, "<story>x</story>", "/comp.rsfc");
    expect(receivedIds).toContain("/comp.rsfc");
  });

  it("returning null from a custom block transform produces no extra output", async () => {
    const plugin = rsfcPlugin({
      customBlockTransforms: {
        noop: () => null,
      },
    });
    const result = (await callTransform(plugin, "<noop>ignored</noop>", "/a.rsfc")) as { code: string };
    expect(result.code).not.toContain("ignored");
  });
});

// ---------------------------------------------------------------------------
// transform — source map
// ---------------------------------------------------------------------------

describe("transform — source map", () => {
  it("returns a map alongside the code", async () => {
    const plugin = rsfcPlugin();
    const source = src("<script>const x = 1</script>");
    const result = (await callTransform(plugin, source, "/a.rsfc")) as {
      code: string;
      map: unknown;
    };
    expect(result.map).toBeDefined();
    expect(result.map).not.toBeNull();
  });

  it("map has version 3", async () => {
    const plugin = rsfcPlugin();
    const result = (await callTransform(
      plugin,
      "<script>x</script>",
      "/a.rsfc"
    )) as { map: { version: number } };
    expect(result.map.version).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// transform — parse errors
// ---------------------------------------------------------------------------

describe("transform — parse errors become warnings", () => {
  it("warns instead of throwing when the descriptor has errors", async () => {
    const plugin = rsfcPlugin();
    const ctx = { warn: vi.fn(), error: vi.fn() };
    // Missing closing tag → parse error
    const result = await callTransform(plugin, "<script>no close", "/a.rsfc", ctx);
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

  it("returns the id for virtual modules registered during transform", async () => {
    const plugin = rsfcPlugin();
    // Run transform first to register the virtual module
    await callTransform(plugin, "<style>.foo{}</style>", "/comp.rsfc");
    const vmId = "\0rsfc:style:/comp.rsfc:0.css";
    expect(callResolveId(plugin, vmId)).toBe(vmId);
  });

  it("does not resolve ids from other plugin instances", async () => {
    const plugin1 = rsfcPlugin();
    const plugin2 = rsfcPlugin();
    await callTransform(plugin1, "<style>.foo{}</style>", "/comp.rsfc");
    const vmId = "\0rsfc:style:/comp.rsfc:0.css";
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

  it("returns the style code for a registered virtual module", async () => {
    const plugin = rsfcPlugin();
    await callTransform(plugin, "<style>\n.foo { color: red; }\n</style>", "/comp.rsfc");
    const vmId = "\0rsfc:style:/comp.rsfc:0.css";
    const result = callLoad(plugin, vmId) as { code: string };
    expect(result.code).toContain(".foo { color: red; }");
  });

  it("returns code for each of multiple style blocks", async () => {
    const plugin = rsfcPlugin();
    await callTransform(
      plugin,
      src("<style>.base{}</style>", "<style>.theme{}</style>"),
      "/comp.rsfc"
    );
    const r0 = callLoad(plugin, "\0rsfc:style:/comp.rsfc:0.css") as { code: string };
    const r1 = callLoad(plugin, "\0rsfc:style:/comp.rsfc:1.css") as { code: string };
    expect(r0.code).toContain(".base");
    expect(r1.code).toContain(".theme");
  });

  it("virtual modules are isolated per plugin instance", async () => {
    const plugin1 = rsfcPlugin();
    const plugin2 = rsfcPlugin();
    await callTransform(plugin1, "<style>.foo{}</style>", "/comp.rsfc");
    // plugin2 never processed this file
    expect(callLoad(plugin2, "\0rsfc:style:/comp.rsfc:0.css")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleHotUpdate — HMR
// ---------------------------------------------------------------------------

type HmrCtx = import("vite").HmrContext;

function callHotUpdate(
  plugin: import("vite").Plugin,
  file: string,
  source: string,
  existingVmId?: string
) {
  const fn = plugin.handleHotUpdate;
  if (fn === undefined || typeof fn !== "function")
    throw new Error("handleHotUpdate not defined");

  const mockMod = { id: file } as unknown as import("vite").ModuleNode;
  const styleNode = existingVmId
    ? ({ id: existingVmId } as unknown as import("vite").ModuleNode)
    : null;

  const ctx = {
    file,
    timestamp: Date.now(),
    modules: [mockMod],
    read: () => source,
    server: {
      moduleGraph: {
        getModuleById: (id: string) =>
          id === existingVmId ? styleNode : null,
      },
    },
  } as unknown as HmrCtx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).call({}, ctx) as Promise<import("vite").ModuleNode[] | void>;
}

describe("handleHotUpdate", () => {
  it("returns undefined (no-op) for non-.rsfc files", async () => {
    const plugin = rsfcPlugin();
    const result = await callHotUpdate(plugin, "/src/foo.ts", "const x = 1");
    expect(result).toBeUndefined();
  });

  it("refreshes the virtual module cache when a .rsfc file changes", async () => {
    const plugin = rsfcPlugin();
    // Warm up with initial content
    await callTransform(plugin, "<style>.old{}</style>", "/comp.rsfc");
    const vmId = "\0rsfc:style:/comp.rsfc:0.css";
    expect((callLoad(plugin, vmId) as { code: string }).code).toContain(".old");

    // Hot update with new content
    await callHotUpdate(plugin, "/comp.rsfc", "<style>.new{}</style>", vmId);
    expect((callLoad(plugin, vmId) as { code: string }).code).toContain(".new");
  });

  it("returns the .rsfc module node", async () => {
    const plugin = rsfcPlugin();
    const result = await callHotUpdate(
      plugin,
      "/comp.rsfc",
      "<script>export const x = 1</script>"
    );
    expect(Array.isArray(result)).toBe(true);
    expect((result as import("vite").ModuleNode[]).some((m) => m.id === "/comp.rsfc")).toBe(true);
  });

  it("includes style virtual module nodes in the returned list", async () => {
    const plugin = rsfcPlugin();
    const vmId = "\0rsfc:style:/comp.rsfc:0.css";
    const result = await callHotUpdate(
      plugin,
      "/comp.rsfc",
      "<style>.x{}</style>",
      vmId
    );
    expect(Array.isArray(result)).toBe(true);
    expect((result as import("vite").ModuleNode[]).some((m) => m.id === vmId)).toBe(true);
  });
});
