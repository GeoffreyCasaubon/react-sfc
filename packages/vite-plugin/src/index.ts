import type { Plugin, TransformResult, ModuleNode } from "vite";
import { transformWithEsbuild } from "vite";
import { parse, generate } from "@rsfc/core";
import type { CustomBlock } from "@rsfc/core";

export interface RsfcPluginOptions {
  /**
   * Glob patterns to include as RSFC files.
   * @default ["**\/*.rsfc"]
   */
  include?: string[] | undefined;
  /**
   * Glob patterns to exclude.
   * @default ["node_modules/**"]
   */
  exclude?: string[] | undefined;
  /**
   * Map of custom block tag names to transform functions.
   * Each function receives the block and the file id, and should return
   * a JavaScript string to append to the module output (or null to ignore).
   *
   * @example
   * ```ts
   * rsfc({
   *   customBlockTransforms: {
   *     graphql: (block) => `export const QUERY = \`${block.content}\`;`,
   *     i18n: (block, id) => `export const messages = ${block.content};`,
   *   },
   * })
   * ```
   */
  customBlockTransforms?: {
    [tag: string]: (block: CustomBlock, id: string) => string | null | undefined;
  } | undefined;
}

// Converts a simple glob pattern (*, **, ?) to a RegExp.
// Handles the common Vite plugin include/exclude cases without extra deps.
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\x00")
    .replace(/\*/g, "[^/]*")
    .replace(/\x00/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`(?:^|/)${escaped}(?:$|[?#])`);
}

function makeFilter(
  include: string[] | undefined,
  exclude: string[] | undefined,
): (id: string) => boolean {
  const includeRe = include?.map(globToRegex);
  const excludeRe = exclude?.map(globToRegex);

  return (id: string) => {
    const clean = id.split("?")[0]!;

    if (excludeRe?.some((re) => re.test(clean))) return false;
    if (includeRe) return includeRe.some((re) => re.test(clean));
    return clean.endsWith(".rsfc");
  };
}

/**
 * Vite plugin for React Single File Components.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import rsfc from "@rsfc/vite-plugin";
 * export default defineConfig({ plugins: [rsfc()] });
 * ```
 */
export default function rsfc(options: RsfcPluginOptions = {}): Plugin {
  // Per-instance cache: virtual module id → CSS code.
  // Populated during transform, consumed by resolveId + load.
  const virtualModuleCache = new Map<string, string>();
  // Cache last-seen source per file to detect style-only vs full changes in HMR.
  const sourceCache = new Map<string, string>();
  const filter = makeFilter(options.include, options.exclude);

  return {
    name: "vite-plugin-rsfc",
    enforce: "pre",

    resolveId(id) {
      // Only claim ids that we registered during a previous transform call.
      return virtualModuleCache.has(id) ? id : null;
    },

    load(id) {
      const code = virtualModuleCache.get(id);
      return code !== undefined ? { code } : null;
    },

    async transform(code, id): Promise<TransformResult | null> {
      if (!filter(id)) return null;

      // Keep a snapshot of the source for HMR diffing.
      sourceCache.set(id, code);

      const descriptor = parse(code, { filename: id });

      // Surface parse errors as Vite warnings — never throw (resilient transform).
      for (const err of descriptor.errors) {
        this.warn(`[rsfc] ${err.message} (${id}:${err.loc.start.line + 1})`);
      }

      const output = generate(descriptor);

      // Register style virtual modules so resolveId + load can serve them.
      for (const vm of output.virtualModules) {
        virtualModuleCache.set(vm.id, vm.code);
      }

      // Append custom block transform outputs (if any) before esbuild so
      // TypeScript in the transform result is also stripped.
      let extraCode = "";
      if (options.customBlockTransforms) {
        for (const block of descriptor.customBlocks) {
          const fn = options.customBlockTransforms[block.tag];
          if (fn) {
            const result = fn(block, id);
            if (result != null) extraCode += "\n" + result;
          }
        }
      }

      // Strip TypeScript and transform JSX via esbuild. Using a synthetic .tsx
      // filename so esbuild applies both TS stripping and JSX transformation,
      // which it would skip for the raw .rsfc id.
      const stripped = await transformWithEsbuild(output.code + extraCode, id + ".tsx", {
        loader: "tsx",
        target: "esnext",
        jsx: "automatic",
        sourcefile: id,
      });

      return { code: stripped.code, map: stripped.map } as unknown as TransformResult;
    },

    async handleHotUpdate({ file, read, modules, server }) {
      if (!filter(file)) return;

      const newSource = await read();
      const newDesc = parse(newSource, { filename: file });
      const output = generate(newDesc);

      // Refresh style virtual module cache.
      for (const vm of output.virtualModules) {
        virtualModuleCache.set(vm.id, vm.code);
      }

      const styleModules: ModuleNode[] = output.virtualModules
        .map((vm) => server.moduleGraph.getModuleById(vm.id))
        .filter((m): m is ModuleNode => m !== null && m !== undefined);

      // Detect style-only changes: if script, template, and clientScript blocks
      // are unchanged we can do a targeted CSS hot-update (no component reload).
      const prevSource = sourceCache.get(file);
      sourceCache.set(file, newSource);

      if (prevSource !== undefined && prevSource !== newSource) {
        const prevDesc = parse(prevSource, { filename: file });
        const jsUnchanged =
          prevDesc.script?.content === newDesc.script?.content &&
          prevDesc.scriptSetup?.content === newDesc.scriptSetup?.content &&
          prevDesc.clientScript?.content === newDesc.clientScript?.content &&
          prevDesc.template?.content === newDesc.template?.content &&
          prevDesc.customBlocks.length === newDesc.customBlocks.length;

        if (jsUnchanged && styleModules.length > 0) {
          // Style-only change: hot-swap CSS without re-rendering the component.
          return styleModules;
        }
      }

      // Script or template changed: full module invalidation triggers HMR
      // boundary re-evaluation (component re-renders with new code).
      return [...modules, ...styleModules];
    },
  };
}
