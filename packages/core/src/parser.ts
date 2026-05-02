import type {
  CustomBlock,
  RsfcBlock,
  RsfcBlockKind,
  RsfcDescriptor,
  RsfcParseError,
  SourceLocation,
  SourcePosition,
  StyleBlock,
} from "./types.js";

// Match any tag that looks like a component-style block: starts with a letter,
// followed by alphanumeric characters. This captures known kinds, <docs>, and
// arbitrary custom blocks (<graphql>, <i18n>, etc.).
const OPEN_TAG_SRC = `<([a-zA-Z][a-zA-Z0-9]*)((?:\\s[^>]*)?)>`;
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

/**
 * Find the first occurrence of `</tagName>` starting at `from`, skipping over
 * single-quoted, double-quoted, and backtick strings so that closing tags
 * embedded inside string literals are not mistaken for the real block boundary.
 *
 * Returns the index of `<`, or -1 if not found.
 */
function findClosingTag(source: string, tagName: string, from: number): number {
  const closing = `</${tagName}>`;
  let i = from;

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < source.length) {
        const c = source[i]!;
        if (c === "\\") { i += 2; continue; }
        if (c === q) { i++; break; }
        i++;
      }
      continue;
    }

    if (ch === "`") {
      i++;
      while (i < source.length) {
        const c = source[i]!;
        if (c === "\\") { i += 2; continue; }
        if (c === "`") { i++; break; }
        i++;
      }
      continue;
    }

    if (source.startsWith(closing, i)) return i;
    i++;
  }

  return -1;
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
    docs: null,
    customBlocks: [],
    errors: [],
  };

  const errors: RsfcParseError[] = [];
  const openTagRe = new RegExp(OPEN_TAG_SRC, "g");

  let match: RegExpExecArray | null;
  while ((match = openTagRe.exec(source)) !== null) {
    const tagName = match[1]!;
    const attrsStr = match[2] as string;
    const openTagEnd = match.index + match[0].length;

    const closingTag = `</${tagName}>`;
    const closeIdx = findClosingTag(source, tagName, openTagEnd);

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

    switch (tagName) {
      case "script": {
        const block: RsfcBlock = { kind: "script", content, loc, attrs, ...(lang !== undefined ? { lang } : {}) };
        if ("setup" in attrs) {
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
      }
      case "clientScript": {
        const block: RsfcBlock = { kind: "clientScript", content, loc, attrs, ...(lang !== undefined ? { lang } : {}) };
        if (descriptor.clientScript !== null) {
          errors.push({ message: "Duplicate <clientScript> block", loc });
        } else {
          descriptor.clientScript = block;
        }
        break;
      }
      case "template": {
        const block: RsfcBlock = { kind: "template", content, loc, attrs, ...(lang !== undefined ? { lang } : {}) };
        if (descriptor.template !== null) {
          errors.push({ message: "Duplicate <template> block", loc });
        } else {
          descriptor.template = block;
        }
        break;
      }
      case "style": {
        const block: RsfcBlock = { kind: "style", content, loc, attrs, ...(lang !== undefined ? { lang } : {}) };
        descriptor.styles.push(block as StyleBlock);
        break;
      }
      case "docs": {
        const block: RsfcBlock = { kind: "docs", content, loc, attrs, ...(lang !== undefined ? { lang } : {}) };
        if (descriptor.docs !== null) {
          errors.push({ message: "Duplicate <docs> block", loc });
        } else {
          descriptor.docs = block;
        }
        break;
      }
      default: {
        const customBlock: CustomBlock = {
          kind: "custom",
          tag: tagName,
          content,
          loc,
          attrs,
          ...(lang !== undefined ? { lang } : {}),
        };
        descriptor.customBlocks.push(customBlock);
        break;
      }
    }

    // Skip past the closing tag so nested tags inside block content
    // are not mistakenly picked up as top-level blocks.
    openTagRe.lastIndex = closeIdx + closingTag.length;
  }

  descriptor.errors = errors;
  return descriptor;
}
