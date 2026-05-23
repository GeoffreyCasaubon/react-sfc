import type { CodeMapping, LanguagePlugin, VirtualCode } from '@volar/language-core';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { parse, type StyleBlock } from '@g-casau/rsfc-core';

// Wrapper injected around the <template> block to make it valid TSX.
// These must be kept in sync with TEMPLATE_SUFFIX below.
const TEMPLATE_PREFIX = '\nexport default function __rsfc_component__() {\n  return (\n';
const TEMPLATE_SUFFIX = '\n  );\n}\n';

const ALL_FEATURES: CodeMapping['data'] = {
  verification: true,
  completion: true,
  semantic: true,
  navigation: true,
  structure: true,
  format: false,
};

function makeSnapshot(text: string): ts.IScriptSnapshot {
  return {
    getText: (start, end) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  };
}

function buildVirtualCode(snapshot: ts.IScriptSnapshot): VirtualCode {
  const text = snapshot.getText(0, snapshot.getLength());

  let descriptor;
  try {
    descriptor = parse(text, { filename: 'component.rsfc' });
  } catch {
    return { id: 'root', languageId: 'rsfc', snapshot, mappings: [], embeddedCodes: [] };
  }

  let generated = '';
  const mappings: CodeMapping[] = [];

  // <script> — module-level imports/exports
  if (descriptor.script) {
    const genStart = generated.length;
    generated += descriptor.script.content + '\n';
    mappings.push({
      sourceOffsets: [descriptor.script.loc.start.offset],
      generatedOffsets: [genStart],
      lengths: [descriptor.script.content.length],
      data: ALL_FEATURES,
    });
  }

  // <script setup> — component setup (hooks, logic)
  if (descriptor.scriptSetup) {
    const genStart = generated.length;
    generated += descriptor.scriptSetup.content + '\n';
    mappings.push({
      sourceOffsets: [descriptor.scriptSetup.loc.start.offset],
      generatedOffsets: [genStart],
      lengths: [descriptor.scriptSetup.content.length],
      data: ALL_FEATURES,
    });
  }

  // <clientScript> — browser-only script
  if (descriptor.clientScript) {
    const genStart = generated.length;
    generated += descriptor.clientScript.content + '\n';
    mappings.push({
      sourceOffsets: [descriptor.clientScript.loc.start.offset],
      generatedOffsets: [genStart],
      lengths: [descriptor.clientScript.content.length],
      data: ALL_FEATURES,
    });
  }

  // Inject CSS module bindings for <style module> blocks (synthetic — no source mapping)
  for (const style of descriptor.styles) {
    const mod = (style as StyleBlock).attrs['module'];
    if (mod === undefined) continue;
    const varName = mod === true ? 'styles' : String(mod);
    generated += `declare const ${varName}: Record<string, string>;\n`;
  }

  // <template> — JSX, wrapped so it's valid TSX syntax
  if (descriptor.template) {
    const genStart = generated.length + TEMPLATE_PREFIX.length;
    generated += TEMPLATE_PREFIX + descriptor.template.content + TEMPLATE_SUFFIX;
    mappings.push({
      sourceOffsets: [descriptor.template.loc.start.offset],
      generatedOffsets: [genStart],
      lengths: [descriptor.template.content.length],
      data: ALL_FEATURES,
    });
  }

  const embeddedCodes: VirtualCode[] = [];
  if (generated.trim()) {
    embeddedCodes.push({
      id: 'tsx',
      languageId: 'typescriptreact',
      snapshot: makeSnapshot(generated),
      mappings,
      embeddedCodes: [],
    });
  }

  return {
    id: 'root',
    languageId: 'rsfc',
    snapshot,
    mappings: [],
    embeddedCodes,
  };
}

export const rsfcLanguagePlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.path.endsWith('.rsfc')) return 'rsfc';
    return undefined;
  },

  createVirtualCode(_uri, languageId, snapshot, _ctx) {
    if (languageId !== 'rsfc') return undefined;
    return buildVirtualCode(snapshot);
  },

  updateVirtualCode(_uri, _prev, snapshot, _ctx) {
    return buildVirtualCode(snapshot);
  },

  typescript: {
    extraFileExtensions: [
      { extension: 'rsfc', isMixedContent: true, scriptKind: 7 as ts.ScriptKind /* Deferred */ },
    ],
    getServiceScript(root) {
      const tsx = root.embeddedCodes?.find(c => c.id === 'tsx');
      if (!tsx) return undefined;
      return { code: tsx, extension: '.tsx', scriptKind: 4 as ts.ScriptKind /* TSX */ };
    },
  },
};
