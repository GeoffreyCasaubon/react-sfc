import { describe, it, expect } from 'vitest';
import { rsfcLanguagePlugin } from './rsfc-language-plugin';
import { URI } from 'vscode-uri';
import type { CodegenContext, IScriptSnapshot } from '@volar/language-core';

function makeSnapshot(text: string): IScriptSnapshot {
  return {
    getText: (start: number, end: number) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  };
}

const mockCtx: CodegenContext<URI> = { getAssociatedScript: () => undefined };

const URI_RSFC = URI.parse('file:///test.rsfc');
const URI_TS = URI.parse('file:///test.ts');

function createCode(source: string) {
  return rsfcLanguagePlugin.createVirtualCode!(URI_RSFC, 'rsfc', makeSnapshot(source), mockCtx)!;
}

const RSFC_SCRIPT = `<script>
const answer = 42;
function greet(name: string) {
  return \`hello \${name}\`;
}
</script>`;

const RSFC_SETUP = `<script setup lang="ts">
import { useState } from 'react';
const [count, setCount] = useState(0);
</script>`;

const RSFC_TEMPLATE = `<template>
<div>{count}</div>
</template>`;

const RSFC_SETUP_AND_TEMPLATE = `<script setup lang="ts">
import { useState } from 'react';
const [count, setCount] = useState(0);
</script>
<template>
<div>{count}</div>
</template>`;

const RSFC_BOTH_BLOCKS = `<script>
export const version = '1.0';
</script>
<clientScript>
document.title = 'hello';
</clientScript>`;

const RSFC_NO_SCRIPT = `<style>
body { color: red; }
</style>`;

// ---------------------------------------------------------------------------
// getLanguageId
// ---------------------------------------------------------------------------

describe('getLanguageId', () => {
  it('returns rsfc for .rsfc URIs', () => {
    expect(rsfcLanguagePlugin.getLanguageId(URI_RSFC)).toBe('rsfc');
  });

  it('returns undefined for .ts URIs', () => {
    expect(rsfcLanguagePlugin.getLanguageId(URI_TS)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createVirtualCode — root code
// ---------------------------------------------------------------------------

describe('createVirtualCode — root', () => {
  it('returns undefined for non-rsfc languageId', () => {
    const result = rsfcLanguagePlugin.createVirtualCode!(URI_RSFC, 'typescript', makeSnapshot(RSFC_SCRIPT), mockCtx);
    expect(result).toBeUndefined();
  });

  it('returns root VirtualCode for rsfc languageId', () => {
    const result = createCode(RSFC_SCRIPT);
    expect(result).toBeDefined();
    expect(result.id).toBe('root');
    expect(result.languageId).toBe('rsfc');
  });

  it('root mappings are empty (everything via embeddedCodes)', () => {
    const result = createCode(RSFC_SCRIPT);
    expect(result.mappings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createVirtualCode — embedded tsx code
// ---------------------------------------------------------------------------

describe('createVirtualCode — tsx embedded code', () => {
  it('produces one embedded code named "tsx" for <script>', () => {
    const root = createCode(RSFC_SCRIPT);
    expect(root.embeddedCodes).toHaveLength(1);
    expect(root.embeddedCodes![0].id).toBe('tsx');
    expect(root.embeddedCodes![0].languageId).toBe('typescriptreact');
  });

  it('produces tsx with <script setup> content', () => {
    const root = createCode(RSFC_SETUP);
    const tsx = root.embeddedCodes![0];
    const generated = tsx.snapshot.getText(0, tsx.snapshot.getLength());
    expect(generated).toContain("import { useState } from 'react'");
    expect(generated).toContain('const [count, setCount] = useState(0)');
  });

  it('produces tsx with <template> content wrapped in a function', () => {
    const root = createCode(RSFC_TEMPLATE);
    const tsx = root.embeddedCodes![0];
    const generated = tsx.snapshot.getText(0, tsx.snapshot.getLength());
    expect(generated).toContain('<div>{count}</div>');
    expect(generated).toContain('__rsfc_component__');
    expect(generated).toContain('return (');
  });

  it('combines scriptSetup and template in same virtual file', () => {
    const root = createCode(RSFC_SETUP_AND_TEMPLATE);
    expect(root.embeddedCodes).toHaveLength(1);
    const tsx = root.embeddedCodes![0];
    const generated = tsx.snapshot.getText(0, tsx.snapshot.getLength());
    expect(generated).toContain('useState');
    expect(generated).toContain('<div>{count}</div>');
  });

  it('produces no embedded code when no script or template blocks present', () => {
    const root = createCode(RSFC_NO_SCRIPT);
    expect(root.embeddedCodes ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Mapping correctness — source text must match generated text at mapped offsets
// ---------------------------------------------------------------------------

describe('mapping offsets', () => {
  function assertMappingsCorrect(source: string) {
    const root = createCode(source);
    const tsx = root.embeddedCodes![0];
    const generated = tsx.snapshot.getText(0, tsx.snapshot.getLength());
    for (const mapping of tsx.mappings) {
      for (let i = 0; i < mapping.sourceOffsets.length; i++) {
        const srcSlice = source.slice(
          mapping.sourceOffsets[i],
          mapping.sourceOffsets[i] + mapping.lengths[i],
        );
        const genSlice = generated.slice(
          mapping.generatedOffsets[i],
          mapping.generatedOffsets[i] + mapping.lengths[i],
        );
        expect(srcSlice).toBe(genSlice);
      }
    }
  }

  it('source-to-generated invariant holds for <script> block', () => {
    assertMappingsCorrect(RSFC_SCRIPT);
  });

  it('source-to-generated invariant holds for <script setup> block', () => {
    assertMappingsCorrect(RSFC_SETUP);
  });

  it('source-to-generated invariant holds for <template> block', () => {
    assertMappingsCorrect(RSFC_TEMPLATE);
  });

  it('source-to-generated invariant holds for setup + template combined', () => {
    assertMappingsCorrect(RSFC_SETUP_AND_TEMPLATE);
  });

  it('both script and clientScript blocks are mapped when both present', () => {
    const root = createCode(RSFC_BOTH_BLOCKS);
    const tsx = root.embeddedCodes![0];
    expect(tsx.mappings).toHaveLength(2);
    const generated = tsx.snapshot.getText(0, tsx.snapshot.getLength());
    expect(generated).toContain("export const version = '1.0';");
    expect(generated).toContain("document.title = 'hello';");
  });

  it('identifier in source maps to same identifier in generated', () => {
    const source = `<script>\nfunction add(a: number, b: number) {\n  return a + b;\n}\nconst result = add(1, 2);\n</script>`;
    const root = createCode(source);
    const tsx = root.embeddedCodes![0];
    const generated = tsx.snapshot.getText(0, tsx.snapshot.getLength());
    const mapping = tsx.mappings[0];
    const resultIdxInSource = source.indexOf('result');
    const delta = resultIdxInSource - mapping.sourceOffsets[0];
    const resultIdxInGenerated = mapping.generatedOffsets[0] + delta;
    expect(generated.slice(resultIdxInGenerated, resultIdxInGenerated + 'result'.length)).toBe('result');
  });
});

// ---------------------------------------------------------------------------
// Mapping data — semantic tokens must be enabled
// ---------------------------------------------------------------------------

describe('mapping data (CodeInformation)', () => {
  it('all mappings have semantic: true', () => {
    const tsx = createCode(RSFC_SCRIPT).embeddedCodes![0];
    for (const m of tsx.mappings) expect(m.data.semantic).toBe(true);
  });

  it('all mappings have verification: true (diagnostics enabled)', () => {
    const tsx = createCode(RSFC_SCRIPT).embeddedCodes![0];
    for (const m of tsx.mappings) expect(m.data.verification).toBe(true);
  });

  it('all mappings have completion: true', () => {
    const tsx = createCode(RSFC_SCRIPT).embeddedCodes![0];
    for (const m of tsx.mappings) expect(m.data.completion).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateVirtualCode
// ---------------------------------------------------------------------------

describe('updateVirtualCode', () => {
  it('regenerates virtual code from new snapshot', () => {
    const prev = createCode(RSFC_SCRIPT);
    const updated = rsfcLanguagePlugin.updateVirtualCode!(URI_RSFC, prev, makeSnapshot(RSFC_NO_SCRIPT), mockCtx);
    expect((updated!.embeddedCodes ?? []).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TypeScript integration
// ---------------------------------------------------------------------------

describe('typescript integration', () => {
  it('extraFileExtensions registers .rsfc as mixed content with Deferred scriptKind', () => {
    const ext = rsfcLanguagePlugin.typescript!.extraFileExtensions[0];
    expect(ext.extension).toBe('rsfc');
    expect(ext.isMixedContent).toBe(true);
    expect(ext.scriptKind).toBe(7); // ts.ScriptKind.Deferred
  });

  it('getServiceScript returns tsx code with TSX scriptKind', () => {
    const root = createCode(RSFC_SCRIPT);
    const service = rsfcLanguagePlugin.typescript!.getServiceScript(root);
    expect(service).toBeDefined();
    expect(service!.extension).toBe('.tsx');
    expect(service!.scriptKind).toBe(4); // ts.ScriptKind.TSX
    expect(service!.code.id).toBe('tsx');
  });

  it('getServiceScript returns undefined when no script blocks', () => {
    const root = createCode(RSFC_NO_SCRIPT);
    const service = rsfcLanguagePlugin.typescript!.getServiceScript(root);
    expect(service).toBeUndefined();
  });
});
