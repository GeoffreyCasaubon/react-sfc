import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "esbuild";
import { parse, generate, compileCss, buildStyleIIFE } from "@g-casau/rsfc-core";
import type { RsfcDescriptor, VirtualModule } from "@g-casau/rsfc-core";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a `.rsfc` file to standalone JavaScript.
 * Style virtual modules are inlined as DOM-injection IIFEs.
 * CSS preprocessors (Sass/Less/Stylus) are compiled when the peer package is
 * installed; if the package is missing the raw source is injected as-is.
 */
export async function compileFile(inputPath: string): Promise<string> {
  const filename = resolve(inputPath);
  const source = readFileSync(filename, "utf-8");
  const descriptor = parse(source, { filename });
  const output = generate(descriptor);
  const js = await inlineVirtualModules(output.code, output.virtualModules);
  const result = await transform(js, {
    loader: "tsx",
    target: "esnext",
    jsx: "automatic",
    sourcefile: filename,
  });
  return result.code;
}

/**
 * Parse a `.rsfc` file and return its descriptor.
 * Useful for tooling (editors, linters, documentation generators).
 */
export function parseFile(inputPath: string): RsfcDescriptor {
  const filename = resolve(inputPath);
  const source = readFileSync(filename, "utf-8");
  return parse(source, { filename });
}

// ---------------------------------------------------------------------------
// Virtual module inlining
// ---------------------------------------------------------------------------

async function inlineVirtualModules(
  code: string,
  virtualModules: VirtualModule[],
): Promise<string> {
  let result = code;
  let styleIdx = 0;
  for (const vm of virtualModules) {
    if (vm.moduleVar !== undefined) {
      const importStatement = `import ${vm.moduleVar} from "${vm.id}";`;
      result = result.replace(
        importStatement,
        `const ${vm.moduleVar} = ${JSON.stringify(vm.classMap ?? {})};`,
      );
    } else {
      const importStatement = `import "${vm.id}";`;
      // Preprocessor packages are optional in the CLI: fall back to raw CSS
      // if the package is not installed rather than aborting compilation.
      let css: string;
      try {
        css = await compileCss(vm);
      } catch {
        css = vm.code;
      }
      result = result.replace(importStatement, buildStyleIIFE(css, styleIdx));
      styleIdx++;
    }
  }
  return result;
}
