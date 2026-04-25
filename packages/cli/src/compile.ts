import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, generate } from "@rsfc/core";
import type { RsfcDescriptor, VirtualModule } from "@rsfc/core";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a `.rsfc` file to standalone JavaScript.
 * Style virtual modules are inlined as DOM-injection IIFEs.
 * CSS preprocessors (Sass/Less/Stylus) are compiled when the peer package is
 * installed, otherwise the raw source is injected as-is.
 */
export async function compileFile(inputPath: string): Promise<string> {
  const filename = resolve(inputPath);
  const source = readFileSync(filename, "utf-8");
  const descriptor = parse(source, { filename });
  const output = generate(descriptor);
  return inlineVirtualModules(output.code, output.virtualModules);
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
// Virtual module inlining (mirrors the webpack-loader approach)
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
      const css = await compileCss(vm);
      result = result.replace(importStatement, buildStyleIIFE(css, styleIdx));
      styleIdx++;
    }
  }
  return result;
}

async function compileCss(vm: VirtualModule): Promise<string> {
  if (vm.id.endsWith(".scss") || vm.id.endsWith(".sass")) {
    try {
      const sass = await import("sass");
      const syntax = vm.id.endsWith(".sass") ? "indented" : "scss";
      const result = await sass.compileStringAsync(vm.code, { syntax });
      return result.css;
    } catch {
      return vm.code;
    }
  }
  if (vm.id.endsWith(".less")) {
    try {
      const less = (await import("less" as string)).default as { render(s: string): Promise<{ css: string }> };
      const result = await less.render(vm.code);
      return result.css;
    } catch {
      return vm.code;
    }
  }
  if (vm.id.endsWith(".styl") || vm.id.endsWith(".stylus")) {
    try {
      const stylus = (await import("stylus" as string)).default as { render(s: string): string };
      return stylus.render(vm.code);
    } catch {
      return vm.code;
    }
  }
  return vm.code;
}

function buildStyleIIFE(css: string, index: number): string {
  const varName = `__rsfc_style_${index}__`;
  return [
    `;/* rsfc:style:${index} */`,
    `if (typeof document !== 'undefined') {`,
    `  var ${varName} = document.createElement('style');`,
    `  ${varName}.textContent = ${JSON.stringify(css)};`,
    `  (document.head ?? document.documentElement).appendChild(${varName});`,
    `}`,
  ].join("\n");
}
