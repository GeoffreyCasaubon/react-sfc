import type { Plugin, TransformResult } from "vite";
import { parse, generate } from "@rsfc/core";

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
export default function rsfc(_options: RsfcPluginOptions = {}): Plugin {
  // Per-instance cache: virtual module id → CSS code.
  // Populated during transform, consumed by resolveId + load.
  const virtualModuleCache = new Map<string, string>();

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

    transform(code, id): TransformResult | null {
      if (!id.endsWith(".rsfc")) return null;

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

      // Rollup 4 types SourceMapInput as a class with toUrl(), but at runtime
      // Vite accepts any plain V3 source map object. Cast to bypass the type mismatch.
      // sourcesContent: convert (string | null)[] → string[] as Rollup expects.
      const map = {
        ...output.map,
        sourcesContent: (output.map.sourcesContent ?? []).map((s) => s ?? ""),
      };

      return { code: output.code, map } as unknown as TransformResult;
    },
  };
}
