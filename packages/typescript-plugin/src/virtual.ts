import { parse } from "@rsfc/core";

// ---------------------------------------------------------------------------
// Virtual TypeScript content generation
//
// Converts an .rsfc file into a valid .tsx string that TypeScript can
// type-check. Used by both the language service plugin (in-memory) and
// the CLI declarations command (on-disk .d.ts generation).
// ---------------------------------------------------------------------------

/** Extract the type argument from `defineProps<TYPE>()` by bracket-counting. */
function extractDefinePropsType(line: string): { pattern: string; type: string } | null {
  const match = /^(?:const|let|var)\s+(\{[^}]*\}|\w+)\s*=\s*defineProps\s*</.exec(line.trim());
  if (!match) return null;

  const pattern = match[1]!;
  const ltIdx = line.indexOf("defineProps") + "defineProps".length;
  let depth = 0;
  let typeStart = -1;

  for (let i = ltIdx; i < line.length; i++) {
    if (line[i] === "<") {
      depth++;
      if (depth === 1) typeStart = i + 1;
    } else if (line[i] === ">") {
      depth--;
      if (depth === 0) {
        return { pattern, type: line.slice(typeStart, i).trim() };
      }
    }
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

    // Try defineProps<T>() first
    let propsSignature = "";
    const filteredBody: string[] = [];
    let foundDefineProps = false;

    for (const line of bodyLines) {
      const result = extractDefinePropsType(line);
      if (!foundDefineProps && result) {
        propsSignature = `${result.pattern}: ${result.type}`;
        foundDefineProps = true;
      } else {
        filteredBody.push(line);
      }
    }

    // Fallback: detect `interface Props` or `type Props =`
    if (!propsSignature) {
      const hasPropsInterface = content.match(/(?:^|\n)\s*(?:export\s+)?(?:interface|type)\s+Props\b/);
      if (hasPropsInterface) {
        propsSignature = "props: Props";
      }
    }

    const componentBody = foundDefineProps ? filteredBody : bodyLines;

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
