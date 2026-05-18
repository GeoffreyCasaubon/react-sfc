import {
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  DocumentSymbol,
  FoldingRange,
  FoldingRangeParams,
  Hover,
  InitializeParams,
  InitializeResult,
  InsertTextFormat,
  MarkupKind,
  ProposedFeatures,
  SymbolKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  createConnection,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  parse,
  type RsfcBlock,
  type RsfcDescriptor,
  type SourceLocation,
} from "@g-casau/rsfc-core";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Minimal shape shared by RsfcBlock and CustomBlock — avoids unsafe casts
interface LocatedBlock {
  lang?: string | undefined;
  attrs: Record<string, string | true>;
  loc: SourceLocation;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ["<", " "],
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      foldingRangeProvider: true,
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse(text: string, filename: string): RsfcDescriptor | null {
  try {
    return parse(text, { filename });
  } catch {
    return null;
  }
}

/** Walks backwards from a block's content start to find the opening `<`. */
function findOpenTagOffset(text: string, contentStart: number): number {
  let i = contentStart - 1;
  while (i >= 0 && text[i] !== "<") {
    i--;
  }
  return i >= 0 ? i : contentStart;
}

/** Finds the end of a closing tag starting at or after `contentEnd`. */
function findCloseTagEnd(
  text: string,
  contentEnd: number,
  tagName: string,
): number {
  const closeTag = `</${tagName}>`;
  const idx = text.indexOf(closeTag, contentEnd);
  return idx >= 0 ? idx + closeTag.length : contentEnd;
}

function buildStyleLabel(style: LocatedBlock, index: number): string {
  const parts = ["style"];
  if (style.lang) parts.push(`lang="${style.lang}"`);
  if (style.attrs["scoped"] === true) parts.push("scoped");
  const mod = style.attrs["module"];
  if (mod !== undefined) {
    parts.push(mod === true ? "module" : `module="${mod}"`);
  }
  if (index > 0) parts.push(`(${index + 1})`);
  return parts.join(" ");
}

function defaultLang(blockName: string): string {
  if (blockName === "template") return "tsx";
  if (blockName === "docs") return "markdown";
  return "ts";
}

function formatAttrs(attrs: Record<string, string | true>): string {
  return Object.entries(attrs)
    .map(([k, v]) => (v === true ? `\`${k}\`` : `\`${k}="${v}"\``))
    .join(", ");
}

function findBlockAtOffset(
  descriptor: RsfcDescriptor,
  offset: number,
): { name: string; block: LocatedBlock } | null {
  const candidates: Array<{ name: string; block: LocatedBlock | null }> = [
    { name: "script", block: descriptor.script },
    { name: "script setup", block: descriptor.scriptSetup },
    { name: "clientScript", block: descriptor.clientScript },
    { name: "template", block: descriptor.template },
    { name: "docs", block: descriptor.docs },
    ...descriptor.styles.map((s, i) => ({
      name: buildStyleLabel(s, i),
      block: s as LocatedBlock,
    })),
    ...descriptor.customBlocks.map((c) => ({
      name: c.tag,
      block: c as LocatedBlock,
    })),
  ];

  for (const { name, block } of candidates) {
    if (!block) continue;
    if (offset >= block.loc.start.offset && offset <= block.loc.end.offset) {
      return { name, block };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

documents.onDidChangeContent((change) => validateDocument(change.document));
documents.onDidOpen((event) => validateDocument(event.document));

function validateDocument(doc: TextDocument): void {
  const descriptor = safeParse(doc.getText(), doc.uri);
  if (!descriptor) return;

  const diagnostics: Diagnostic[] = descriptor.errors.map((err) => ({
    severity: DiagnosticSeverity.Error,
    range: {
      start: doc.positionAt(err.loc.start.offset),
      end: doc.positionAt(err.loc.end.offset),
    },
    message: err.message,
    source: "rsfc",
  }));

  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

// ---------------------------------------------------------------------------
// Document Symbols (outline panel)
// ---------------------------------------------------------------------------

connection.onDocumentSymbol((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const descriptor = safeParse(doc.getText(), doc.uri);
  if (!descriptor) return [];

  const symbols: DocumentSymbol[] = [];

  const addSymbol = (label: string, kind: SymbolKind, loc: SourceLocation) => {
    const range = {
      start: doc.positionAt(loc.start.offset),
      end: doc.positionAt(loc.end.offset),
    };
    symbols.push({ name: label, kind, range, selectionRange: range });
  };

  if (descriptor.script)
    addSymbol("script", SymbolKind.Module, descriptor.script.loc);
  if (descriptor.scriptSetup)
    addSymbol("script setup", SymbolKind.Module, descriptor.scriptSetup.loc);
  if (descriptor.clientScript)
    addSymbol("clientScript", SymbolKind.Module, descriptor.clientScript.loc);
  if (descriptor.template)
    addSymbol("template", SymbolKind.Class, descriptor.template.loc);

  descriptor.styles.forEach((s, i) =>
    addSymbol(buildStyleLabel(s, i), SymbolKind.Property, s.loc),
  );

  if (descriptor.docs)
    addSymbol("docs", SymbolKind.File, descriptor.docs.loc);

  descriptor.customBlocks.forEach((c) =>
    addSymbol(c.tag, SymbolKind.Object, c.loc),
  );

  return symbols;
});

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

connection.onHover((params): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const descriptor = safeParse(doc.getText(), doc.uri);
  if (!descriptor) return null;

  const offset = doc.offsetAt(params.position);
  const found = findBlockAtOffset(descriptor, offset);
  if (!found) return null;

  const { name, block } = found;
  const lang = block.lang ?? defaultLang(name);
  const attrsStr = formatAttrs(block.attrs);
  const rows = [
    `| Property | Value |`,
    `| --- | --- |`,
    `| Language | \`${lang}\` |`,
    attrsStr ? `| Attributes | ${attrsStr} |` : null,
  ].filter((l): l is string => l !== null);

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: [`**RSFC \`<${name}>\` block**`, "", ...rows].join("\n"),
    },
  };
});

// ---------------------------------------------------------------------------
// Folding Ranges
// ---------------------------------------------------------------------------

connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const text = doc.getText();
  const descriptor = safeParse(text, doc.uri);
  if (!descriptor) return [];

  const ranges: FoldingRange[] = [];

  const addFolding = (block: { loc: SourceLocation } | null, tagName: string) => {
    if (!block) return;
    const openStart = findOpenTagOffset(text, block.loc.start.offset);
    const closeEnd = findCloseTagEnd(text, block.loc.end.offset, tagName);
    const startLine = doc.positionAt(openStart).line;
    const endLine = doc.positionAt(closeEnd).line;
    if (startLine < endLine) {
      ranges.push({ startLine, endLine });
    }
  };

  addFolding(descriptor.script, "script");
  addFolding(descriptor.scriptSetup, "script");
  addFolding(descriptor.clientScript, "clientScript");
  addFolding(descriptor.template, "template");
  descriptor.styles.forEach((s) => addFolding(s, "style"));
  addFolding(descriptor.docs, "docs");
  descriptor.customBlocks.forEach((c) => addFolding(c, c.tag));

  return ranges;
});

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

const BLOCK_TAG_COMPLETIONS: CompletionItem[] = [
  {
    label: "script",
    kind: CompletionItemKind.Snippet,
    detail: "Module-level TypeScript block",
    insertText: "script>\n\t$0\n</script>",
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value:
        "Module-level code: imports, exports, and static helpers available at module scope.",
    },
  },
  {
    label: "script setup",
    kind: CompletionItemKind.Snippet,
    detail: "Component setup block",
    insertText: "script setup>\n\t$0\n</script>",
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value:
        "`import` statements are auto-hoisted to module scope. Everything else runs inside the component function.",
    },
  },
  {
    label: "template",
    kind: CompletionItemKind.Snippet,
    detail: "JSX template (TypeScript React)",
    insertText: "template>\n\t$0\n</template>",
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value:
        "Component JSX/TSX template. Rendered as the return value of the component function.",
    },
  },
  {
    label: "style",
    kind: CompletionItemKind.Snippet,
    detail: "Global CSS block",
    insertText: "style>\n\t$0\n</style>",
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value: "Global CSS styles injected into the document.",
    },
  },
  {
    label: "style scoped",
    kind: CompletionItemKind.Snippet,
    detail: "Scoped CSS block",
    insertText: "style scoped>\n\t$0\n</style>",
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value:
        "Selectors are auto-namespaced with a unique `data-v-*` attribute so styles only apply to this component.",
    },
  },
  {
    label: "style module",
    kind: CompletionItemKind.Snippet,
    detail: "CSS Modules block",
    insertText: "style module>\n\t$0\n</style>",
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value:
        "Class names are locally scoped and injected as `styles.<className>` in the template.",
    },
  },
  {
    label: 'style lang="scss"',
    kind: CompletionItemKind.Snippet,
    detail: "SCSS style block",
    insertText: 'style lang="scss">\n\t$0\n</style>',
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value: "SCSS style block. Requires `sass` as a peer dependency.",
    },
  },
  {
    label: "clientScript",
    kind: CompletionItemKind.Snippet,
    detail: "Browser-only script block",
    insertText: "clientScript>\n\t$0\n</clientScript>",
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value:
        "Wrapped in a `typeof document !== 'undefined'` guard. Never runs during SSR.",
    },
  },
  {
    label: "docs",
    kind: CompletionItemKind.Snippet,
    detail: "Markdown documentation block",
    insertText: "docs>\n# ${1:ComponentName}\n\n$0\n</docs>",
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: {
      kind: MarkupKind.Markdown,
      value: "Markdown documentation. Ignored by the code generator.",
    },
  },
];

const SCRIPT_ATTR_COMPLETIONS: CompletionItem[] = [
  {
    label: "setup",
    kind: CompletionItemKind.Property,
    insertText: "setup",
    detail: "Component setup mode",
  },
  {
    label: 'lang="ts"',
    kind: CompletionItemKind.Property,
    insertText: 'lang="ts"',
    detail: "TypeScript (default)",
  },
  {
    label: 'lang="tsx"',
    kind: CompletionItemKind.Property,
    insertText: 'lang="tsx"',
    detail: "TypeScript React (JSX)",
  },
  {
    label: 'lang="js"',
    kind: CompletionItemKind.Property,
    insertText: 'lang="js"',
    detail: "JavaScript",
  },
];

const STYLE_ATTR_COMPLETIONS: CompletionItem[] = [
  {
    label: "scoped",
    kind: CompletionItemKind.Property,
    insertText: "scoped",
    detail: "Scope CSS to this component",
  },
  {
    label: "module",
    kind: CompletionItemKind.Property,
    insertText: "module",
    detail: "Enable CSS Modules",
  },
  {
    label: 'lang="css"',
    kind: CompletionItemKind.Property,
    insertText: 'lang="css"',
    detail: "Plain CSS (default)",
  },
  {
    label: 'lang="scss"',
    kind: CompletionItemKind.Property,
    insertText: 'lang="scss"',
    detail: "SCSS (requires sass)",
  },
  {
    label: 'lang="less"',
    kind: CompletionItemKind.Property,
    insertText: 'lang="less"',
    detail: "Less (requires less)",
  },
];

connection.onCompletion(
  (params: TextDocumentPositionParams): CompletionItem[] => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const text = doc.getText();
    const offset = doc.offsetAt(params.position);
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const linePrefix = text.slice(lineStart, offset);

    // Inside an opening block tag — suggest attributes
    const openTagMatch = linePrefix.match(
      /^(<)(script|clientScript|style|template|docs)\b([^>]*)$/,
    );
    if (openTagMatch) {
      const tagName = openTagMatch[2];
      if (tagName === "script" || tagName === "clientScript")
        return SCRIPT_ATTR_COMPLETIONS;
      if (tagName === "style") return STYLE_ATTR_COMPLETIONS;
      return [];
    }

    // After `<` at start of line — suggest block tag names
    if (/^\s*<$/.test(linePrefix)) {
      return BLOCK_TAG_COMPLETIONS;
    }

    return [];
  },
);

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

documents.listen(connection);
connection.listen();
