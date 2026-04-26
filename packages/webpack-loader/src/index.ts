import type { LoaderContext } from "webpack";
import { parse, generate, compileCss, buildStyleIIFE } from "@rsfc/core";
import type { VirtualModule } from "@rsfc/core";

export interface RsfcLoaderOptions {
  // Reserved for future options (e.g. include/exclude patterns)
}

/**
 * Webpack loader for React Single File Components.
 *
 * @example
 * ```js
 * // webpack.config.js / next.config.ts
 * config.module.rules.push({
 *   test: /\.rsfc$/,
 *   use: [{ loader: "@rsfc/webpack-loader" }],
 * });
 * ```
 */
export default function rsfcLoader(
  this: LoaderContext<RsfcLoaderOptions>,
  source: string
): void {
  const callback = this.async();
  const { resourcePath } = this;

  // Must be called synchronously before any async work.
  this.cacheable(true);
  this.addDependency(resourcePath);

  void (async (): Promise<void> => {
    try {
      const descriptor = parse(source, { filename: resourcePath });

      // Surface parse errors as webpack warnings — never abort the build.
      for (const err of descriptor.errors) {
        this.emitWarning(
          new Error(
            `[rsfc] ${err.message} (${resourcePath}:${err.loc.start.line + 1})`
          )
        );
      }

      const output = generate(descriptor);

      // Webpack has no native virtual-module API, so we replace each
      // \0rsfc:style import with an inline style-injection IIFE.
      const code = await injectStyles(output.code, output.virtualModules);

      // Pass the V3 source map as the third callback argument.
      // Webpack accepts plain V3 objects here (the class-based type is a Rollup
      // artefact — at runtime webpack reads properties directly).
      callback(
        null,
        code,
        output.map as unknown as Parameters<typeof callback>[2]
      );
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  })();
}

/**
 * Replace each `import "\0rsfc:style:…";` emitted by the generator with an
 * inline IIFE that appends a `<style>` element to the document.
 *
 * For `.scss`/`.sass` virtual modules the raw source is compiled with Dart Sass
 * before injection. `sass` must be installed by the consumer.
 *
 * The `typeof document !== 'undefined'` guard makes this SSR-safe: on the
 * server the injection is skipped without throwing.
 */
async function injectStyles(code: string, virtualModules: VirtualModule[]): Promise<string> {
  let result = code;
  let styleIdx = 0;
  for (const vm of virtualModules) {
    if (vm.moduleVar !== undefined) {
      // CSS module VM: replace `import styles from "...";` with a plain const.
      const importStatement = `import ${vm.moduleVar} from "${vm.id}";`;
      result = result.replace(
        importStatement,
        `const ${vm.moduleVar} = ${JSON.stringify(vm.classMap ?? {})};`,
      );
    } else {
      // Regular style VM: compile (if needed) and inject via IIFE.
      const importStatement = `import "${vm.id}";`;
      const css = await compileCss(vm);
      result = result.replace(importStatement, buildStyleIIFE(css, styleIdx));
      styleIdx++;
    }
  }
  return result;
}
