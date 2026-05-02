import { parse } from "@g-casau/rsfc-core";

// ---------------------------------------------------------------------------
// Virtual TypeScript content generation
//
// Converts an .rsfc file into a valid .tsx string that TypeScript can
// type-check. Used by both the language service plugin (in-memory) and
// the CLI declarations command (on-disk .d.ts generation).
// ---------------------------------------------------------------------------

/**
 * Extract `defineProps<TYPE>(...)` from an array of body lines, handling
 * multi-line type arguments (e.g. defineProps<{\n  x: string\n}>()).
 * Returns the props signature and the remaining lines with the call removed,
 * or null when no defineProps call is found.
 */
function extractDefinePropsFromLines(lines: string[]): {
  propsSignature: string;
  filteredLines: string[];
} | null {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? "").trim();
    const match = /^(?:const|let|var)\s+(\{[^}]*\}|\w+)\s*=\s*defineProps\s*</.exec(trimmed);
    if (!match) continue;

    const pattern = match[1]!;
    const ltIdx = trimmed.indexOf("defineProps") + "defineProps".length;

    let depth = 0;
    let typeContent = "";
    let lastLineIdx = i;
    let found = false;

    scan: for (let li = i; li < lines.length; li++) {
      const scanText = li === i ? trimmed : (lines[li] ?? "").trim();
      const startJ = li === i ? ltIdx : 0;

      for (let j = startJ; j < scanText.length; j++) {
        const ch = scanText[j]!;
        if (ch === "<") {
          depth++;
          if (depth > 1) typeContent += ch;
        } else if (ch === ">") {
          depth--;
          if (depth === 0) {
            lastLineIdx = li;
            found = true;
            break scan;
          }
          typeContent += ch;
        } else if (depth >= 1) {
          typeContent += ch;
        }
      }

      if (depth > 0) {
        const t = typeContent.trimEnd();
        if (t && t[t.length - 1] !== "{" && t[t.length - 1] !== "<") {
          typeContent = t + "; ";
        }
      }
    }

    if (!found) continue;

    const type = typeContent
      .replace(/;\s*}/g, " }")
      .replace(/^{\s*/, "{ ")
      .trim();

    return {
      propsSignature: `${pattern}: ${type}`,
      filteredLines: [...lines.slice(0, i), ...lines.slice(lastLineIdx + 1)],
    };
  }
  return null;
}

/**
 * Generate a valid `.tsx` file from the contents of an `.rsfc` file.
 *
 * - `<script>` → returned verbatim (already valid TS with explicit exports)
 * - `<script setup>` → wrapped in an exported component function; imports are
 *   hoisted; `defineProps<T>()` becomes the function's parameter signature;
 *   `interface Props` / `type Props` is used as fallback props type.
 * - no script → empty FC returning null
 */
export function makeVirtualContent(rsfcPath: string, readFile: (p: string) => string | undefined): string | undefined {
  const source = readFile(rsfcPath);
  if (source === undefined) return undefined;

  let descriptor;
  try {
    descriptor = parse(source, { filename: rsfcPath });
  } catch {
    return undefined;
  }

  // --- <script> block: return verbatim ----------------------------------------
  if (descriptor.script) {
    return descriptor.script.content;
  }

  // --- <script setup> block ---------------------------------------------------
  if (descriptor.scriptSetup) {
    const content = descriptor.scriptSetup.content;
    const lines = content.split("\n");

    const importLines: string[] = [];
    const bodyLines: string[] = [];

    for (const line of lines) {
      if (/^\s*import[\s{*"'`]/.test(line) && !/^\s*import\s*\(/.test(line)) {
        importLines.push(line);
      } else {
        bodyLines.push(line);
      }
    }

    // Try defineProps<T>() first (handles multi-line type args).
    const definePropsResult = extractDefinePropsFromLines(bodyLines);
    let propsSignature = "";
    let componentBody: string[];

    if (definePropsResult) {
      propsSignature = definePropsResult.propsSignature;
      componentBody = definePropsResult.filteredLines;
    } else {
      componentBody = bodyLines;
      // Fallback: detect `interface Props` or `type Props =`
      const hasPropsInterface = content.match(/(?:^|\n)\s*(?:export\s+)?(?:interface|type)\s+Props\b/);
      if (hasPropsInterface) {
        propsSignature = "props: Props";
      }
    }

    return [
      `import React from "react"`,
      ...importLines,
      ``,
      `export default function Component(${propsSignature}): React.ReactElement {`,
      ...componentBody.map((l) => `  ${l}`),
      `  return null as unknown as React.ReactElement`,
      `}`,
    ].join("\n");
  }

  // --- No script block --------------------------------------------------------
  return [
    `import React from "react"`,
    `export default function Component(): React.ReactElement {`,
    `  return null as unknown as React.ReactElement`,
    `}`,
  ].join("\n");
}
