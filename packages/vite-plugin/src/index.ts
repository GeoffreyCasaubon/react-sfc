import type { Plugin, TransformResult, ModuleNode } from "vite";
import { transformWithEsbuild } from "vite";
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

      // Strip TypeScript and transform JSX via esbuild. Using a synthetic .tsx
      // filename so esbuild applies both TS stripping and JSX transformation,
      // which it would skip for the raw .rsfc id.
      const stripped = await transformWithEsbuild(output.code, id + ".tsx", {
        loader: "tsx",
        target: "esnext",
        jsx: "automatic",
        sourcefile: id,
      });

      return { code: stripped.code, map: stripped.map } as unknown as TransformResult;
    },

    async handleHotUpdate({ file, read, modules, server }) {
      if (!filter(file)) return;

      // Re-generate to get fresh virtual module content.
      const source = await read();
      const output = generate(parse(source, { filename: file }));

      // Refresh the cache so the next load() call returns updated CSS/SCSS.
      for (const vm of output.virtualModules) {
        virtualModuleCache.set(vm.id, vm.code);
      }

      // Collect style virtual module nodes so Vite sends targeted CSS updates
      // rather than a full page reload.
      const styleModules: ModuleNode[] = output.virtualModules
        .map((vm) => server.moduleGraph.getModuleById(vm.id))
        .filter((m): m is ModuleNode => m !== null && m !== undefined);

      return [...modules, ...styleModules];
    },
  };
}
