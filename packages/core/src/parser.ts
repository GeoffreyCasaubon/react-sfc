import type { RsfcBlock, RsfcBlockKind, RsfcDescriptor, RsfcParseError } from "./types.js";

const KNOWN_BLOCK_KINDS = ["script", "clientScript", "template", "style"] as const;

// Matches an opening tag for any known block kind and captures its attributes string.
// The `g` flag is used with manual lastIndex management to skip over block contents.
const OPEN_TAG_SRC = `<(${KNOWN_BLOCK_KINDS.join("|")})((?:\\s[^>]*)?)>`;

// Parses key="value", key='value', or bare key from an attribute string.
const ATTR_RE = /(\w[\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;

function countNewlines(str: string): number {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\n") n++;
  }
  return n;
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
      // Safety: never loop on zero-length match
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
        line: countNewlines(source.slice(0, match.index)),
      });
      // Do not advance lastIndex — let the regex continue from after the opening tag
      // so we can still find other well-formed blocks that follow.
      continue;
    }

    const content = source.slice(openTagEnd, closeIdx);
    const startLine = countNewlines(source.slice(0, openTagEnd));
    const { lang, attrs } = parseAttrs(attrsStr);

    const block: RsfcBlock = {
      kind: tagName,
      content,
      startLine,
      attrs,
      ...(lang !== undefined ? { lang } : {}),
    };

    switch (tagName) {
      case "script":
        if (descriptor.script !== null) {
          errors.push({ message: "Duplicate <script> block", line: startLine });
        } else {
          descriptor.script = block;
        }
        break;
      case "clientScript":
        if (descriptor.clientScript !== null) {
          errors.push({
            message: "Duplicate <clientScript> block",
            line: startLine,
          });
        } else {
          descriptor.clientScript = block;
        }
        break;
      case "template":
        if (descriptor.template !== null) {
          errors.push({
            message: "Duplicate <template> block",
            line: startLine,
          });
        } else {
          descriptor.template = block;
        }
        break;
      case "style":
        descriptor.styles.push(block);
        break;
    }

    // Skip past the closing tag so nested tags inside block content
    // are not mistakenly picked up as top-level blocks.
    openTagRe.lastIndex = closeIdx + closingTag.length;
  }

  descriptor.errors = errors;
  return descriptor;
}
