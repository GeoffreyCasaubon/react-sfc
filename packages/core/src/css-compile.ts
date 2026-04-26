import type { VirtualModule } from "./types.js";

// ---------------------------------------------------------------------------
// Minimal type shapes for optional CSS preprocessor peer deps.
// Defined inline to keep @rsfc/core free of peer type dependencies.
// ---------------------------------------------------------------------------

interface SassLike {
  compileStringAsync(
    source: string,
    opts?: { syntax?: "scss" | "indented" | "css" },
  ): Promise<{ css: string }>;
}
interface LessLike {
  render(source: string): Promise<{ css: string }>;
}
interface StylusLike {
  render(source: string): string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile CSS for a virtual style module, applying the appropriate
 * preprocessor based on the virtual module's id extension.
 *
 * Throws a descriptive error if the required preprocessor package is not
 * installed (e.g. "Install sass to use <style lang=scss>").
 * Returns the raw source unchanged for plain `.css` virtual modules.
 *
 * Used by `@rsfc/webpack-loader` and `@rsfc/cli` to inline styles.
 */
export async function compileCss(vm: VirtualModule): Promise<string> {
  if (vm.id.endsWith(".scss") || vm.id.endsWith(".sass")) {
    let sass: SassLike;
    try {
      sass = (await import("sass")) as unknown as SassLike;
    } catch {
      throw new Error(
        '[rsfc] Install "sass" to use <style lang="scss/sass"> blocks.',
      );
    }
    const syntax = vm.id.endsWith(".sass") ? "indented" : "scss";
    const result = await sass.compileStringAsync(vm.code, { syntax });
    return result.css;
  }

  if (vm.id.endsWith(".less")) {
    let less: LessLike;
    try {
      const mod = await import("less");
      less = (mod.default ?? mod) as unknown as LessLike;
    } catch {
      throw new Error(
        '[rsfc] Install "less" to use <style lang="less"> blocks.',
      );
    }
    const result = await less.render(vm.code);
    return result.css;
  }

  if (vm.id.endsWith(".styl") || vm.id.endsWith(".stylus")) {
    let stylus: StylusLike;
    try {
      const mod = await import("stylus");
      stylus = (mod.default ?? mod) as unknown as StylusLike;
    } catch {
      throw new Error(
        '[rsfc] Install "stylus" to use <style lang="stylus/styl"> blocks.',
      );
    }
    return stylus.render(vm.code);
  }

  return vm.code;
}

/**
 * Wrap compiled CSS in an IIFE that appends a `<style>` element to the DOM.
 *
 * The `typeof document !== 'undefined'` guard makes it SSR-safe: the
 * injection is a no-op on the server.
 *
 * Used by `@rsfc/webpack-loader` and `@rsfc/cli` where Vite's native
 * CSS virtual module pipeline is unavailable.
 */
export function buildStyleIIFE(css: string, index: number): string {
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
