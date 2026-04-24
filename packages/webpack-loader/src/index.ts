/**
 * @rsfc/webpack-loader
 *
 * Transforms .rsfc files into React components via @rsfc/core.
 * TODO: implement once core exports parse() and generate().
 */

import type { LoaderContext } from "webpack";
import type { GeneratedOutput } from "@rsfc/core";

export interface RsfcLoaderOptions {
  // Loader options will be defined here
}

/**
 * Webpack loader for React Single File Components.
 *
 * @example
 * ```js
 * // webpack.config.js
 * module.exports = {
 *   module: { rules: [{ test: /\.rsfc$/, use: ["@rsfc/webpack-loader"] }] },
 * };
 * ```
 */
export default function rsfcLoader(
  this: LoaderContext<RsfcLoaderOptions>,
  source: string
): void {
  const callback = this.async();
  const resourcePath = this.resourcePath;

  this.cacheable(true);
  this.addDependency(resourcePath);

  void (async (): Promise<void> => {
    try {
      // TODO: const output = await generate(parse(source, { filename: resourcePath }));
      //       callback(null, output.code, output.map);
      const _placeholder: GeneratedOutput | null = null;
      void _placeholder;
      callback(null, source);
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  })();
}
