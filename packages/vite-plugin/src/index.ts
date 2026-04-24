/**
 * @rsfc/vite-plugin
 *
 * Transforms .rsfc files into React components via @rsfc/core.
 * TODO: implement once core exports parse() and generate().
 */

import type { Plugin, TransformResult } from "vite";

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
  return {
    name: "vite-plugin-rsfc",
    enforce: "pre",

    resolveId(_id: string) {
      // TODO: intercept virtual module ids from GeneratedOutput.virtualModules
      return null;
    },

    load(_id: string) {
      // TODO: return virtual module code for intercepted ids
      return null;
    },

    transform(_code: string, id: string): TransformResult | null {
      if (!id.endsWith(".rsfc")) return null;
      // TODO: call core parse() then generate(), return { code, map }
      return null;
    },
  };
}
