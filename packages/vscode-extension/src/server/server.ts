import {
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  DocumentSymbol,
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
import { parse, type RsfcBlock, type RsfcDescriptor } from "@g-casau/rsfc-core";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

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
    },
  };
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidOpen((event) => {
  validateDocument(event.document);
});

function validateDocument(doc: TextDocument): void {
  const descriptor = parse(doc.getText(), { filename: doc.uri });

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

  const descriptor = parse(doc.getText(), { filename: doc.uri });
  const symbols: DocumentSymbol[] = [];

  const addBlock = (
    label: string,
    kind: SymbolKind,
    block: RsfcBlock | null,
  ) => {
    if (!block) return;
    const range = {
      start: doc.positionAt(block.loc.start.offset),
      end: doc.positionAt(block.loc.end.offset),
    };
    symbols.push({ name: label, kind, range, selectionRange: range });
  };

  addBlock("script", SymbolKind.Module, descriptor.script);
  addBlock("script setup", SymbolKind.Module, descriptor.scriptSetup);
  addBlock("clientScript", SymbolKind.Module, descriptor.clientScript);
  addBlock("template", SymbolKind.Class, descriptor.template);

  for (let i = 0; i < descriptor.styles.length; i++) {
    const style = descriptor.styles[i];
    const label = buildStyleLabel(style, i);
    addBlock(label, SymbolKind.Property, style);
  }

  addBlock("docs", SymbolKind.File, descriptor.docs);

  for (const custom of descriptor.customBlocks) {
    const range = {
      start: doc.positionAt(custom.loc.start.offset),
      end: doc.positionAt(custom.loc.end.offset),
    };
    symbols.push({
      name: custom.tag,
      kind: SymbolKind.Object,
      range,
      selectionRange: range,
    });
  }

  return symbols;
});

function buildStyleLabel(style: RsfcBlock, index: number): string {
  const parts = ["style"];
  if (style.lang) parts.push(`lang="${style.lang}"`);
  if (style.attrs.scoped === true) parts.push("scoped");
  if (style.attrs.module) {
    parts.push(
      style.attrs.module === true ? "module" : `module="${style.attrs.module}"`,
    );
  }
  if (index > 0) parts.push(`(${index + 1})`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

connection.onHover((params): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);
  const descriptor = parse(text, { filename: doc.uri });

  const found = findBlockAtOffset(descriptor, offset);
  if (!found) return null;

  const { name, block } = found;
  const lang = block.lang ?? defaultLang(name);
  const attrsStr = formatAttrs(block.attrs);

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: [
        `**RSFC \`<${name}>\` block**`,
        ``,
        `| Property | Value |`,
        `| --- | --- |`,
        `| Kind | \`${block.kind}\` |`,
        `| Language | \`${lang}\` |`,
        attrsStr ? `| Attributes | ${attrsStr} |` : null,
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
    },
  };
});

function findBlockAtOffset(
  descriptor: RsfcDescriptor,
  offset: number,
): { name: string; block: RsfcBlock } | null {
  const candidates: Array<{ name: string; block: RsfcBlock | null }> = [
    { name: "script", block: descriptor.script },
    { name: "script setup", block: descriptor.scriptSetup },
    { name: "clientScript", block: descriptor.clientScript },
    { name: "template", block: descriptor.template },
    { name: "docs", block: descriptor.docs },
    ...descriptor.styles.map((s, i) => ({
      name: buildStyleLabel(s, i),
      block: s as RsfcBlock,
    })),
    ...descriptor.customBlocks.map((c) => ({
      name: c.tag,
      block: { ...c, kind: "custom" as const } as unknown as RsfcBlock,
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
        "Component setup function. `import` statements are auto-hoisted to module scope. Everything else runs inside the component function.",
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
      value: "Component JSX/TSX template. Rendered as the return value of the component function.",
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
        "Scoped CSS: selectors are auto-namespaced with a unique `data-v-*` attribute so styles only apply to this component.",
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
        "CSS Modules: class names are locally scoped and injected as `styles.<className>` in the template.",
    },
  },
  {
    label: "style lang scss",
    kind: CompletionItemKind.Snippet,
    detail: "SCSS style block",
    insertText: "style lang=\"scss\">\n\t$0\n</style>",
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
        "Client-only code, wrapped in a `typeof document !== 'undefined'` guard. Never runs during SSR.",
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
      value: "Markdown documentation block. Ignored by the code generator.",
    },
  },
];

const SCRIPT_ATTR_COMPLETIONS: CompletionItem[] = [
  {
    label: "setup",
    kind: CompletionItemKind.Property,
    detail: "Component setup mode",
    insertText: "setup",
    documentation: "Makes this a setup script block.",
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

connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);

  // Current line up to cursor
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const linePrefix = text.slice(lineStart, offset);

  // Inside a block's opening tag — suggest attributes
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
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

documents.listen(connection);
connection.listen();
