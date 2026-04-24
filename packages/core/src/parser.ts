import type {
  RsfcBlock,
  RsfcBlockKind,
  RsfcDescriptor,
  RsfcParseError,
  SourceLocation,
  SourcePosition,
  StyleBlock,
} from "./types.js";

const KNOWN_BLOCK_KINDS = ["script", "clientScript", "template", "style"] as const;
const OPEN_TAG_SRC = `<(${KNOWN_BLOCK_KINDS.join("|")})((?:\\s[^>]*)?)>`;
const ATTR_RE = /(\w[\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;

/** Compute line, column, and offset for an index within `source`. */
function positionAt(source: string, offset: number): SourcePosition {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (source[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart, offset };
}

function locAt(source: string, start: number, end: number): SourceLocation {
  return {
    start: positionAt(source, start),
    end: positionAt(source, end),
  };
}

function parseAttrs(
  attrsStr: string
): { lang: string | undefined; attrs: Record<string, string | true> } {
  const attrs: Record<string, string | true> = {};
  let lang: string | undefined;

  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(attrsStr)) !== null) {
    if (m[0].length === 0) {
      ATTR_RE.lastIndex++;
      continue;
    }
    const key = m[1];
    if (key === undefined || key === "") continue;
    const value = m[2] ?? m[3] ?? m[4];

    if (key === "lang") {
      lang = value;
    } else {
      attrs[key] = value !== undefined ? value : true;
    }
  }

  return { lang, attrs };
}

export function parse(
  source: string,
  options: { filename: string }
): RsfcDescriptor {
  const descriptor: RsfcDescriptor = {
    filename: options.filename,
    source,
    script: null,
    scriptSetup: null,
    clientScript: null,
    template: null,
    styles: [],
    errors: [],
  };

  const errors: RsfcParseError[] = [];
  const openTagRe = new RegExp(OPEN_TAG_SRC, "g");

  let match: RegExpExecArray | null;
  while ((match = openTagRe.exec(source)) !== null) {
    const tagName = match[1] as RsfcBlockKind;
    const attrsStr = match[2] as string;
    const openTagEnd = match.index + match[0].length;

    const closingTag = `</${tagName}>`;
    const closeIdx = source.indexOf(closingTag, openTagEnd);

    if (closeIdx === -1) {
      errors.push({
        message: `Missing closing tag </${tagName}>`,
        loc: locAt(source, match.index, openTagEnd),
      });
      continue;
    }

    const content = source.slice(openTagEnd, closeIdx);
    const loc = locAt(source, openTagEnd, closeIdx);
    const { lang, attrs } = parseAttrs(attrsStr);

    const block: RsfcBlock = {
      kind: tagName,
      content,
      loc,
      attrs,
      ...(lang !== undefined ? { lang } : {}),
    };

    switch (tagName) {
      case "script":
        if ("setup" in attrs) {
          // <script setup> — component setup block
          if (descriptor.scriptSetup !== null) {
            errors.push({ message: "Duplicate <script setup> block", loc });
          } else {
            descriptor.scriptSetup = block;
          }
        } else {
          if (descriptor.script !== null) {
            errors.push({ message: "Duplicate <script> block", loc });
          } else {
            descriptor.script = block;
          }
        }
        break;
      case "clientScript":
        if (descriptor.clientScript !== null) {
          errors.push({ message: "Duplicate <clientScript> block", loc });
        } else {
          descriptor.clientScript = block;
        }
        break;
      case "template":
        if (descriptor.template !== null) {
          errors.push({ message: "Duplicate <template> block", loc });
        } else {
          descriptor.template = block;
        }
        break;
      case "style":
        descriptor.styles.push(block as StyleBlock);
        break;
    }

    // Skip past the closing tag so nested tags inside block content
    // are not mistakenly picked up as top-level blocks.
    openTagRe.lastIndex = closeIdx + closingTag.length;
  }

  descriptor.errors = errors;
  return descriptor;
}
