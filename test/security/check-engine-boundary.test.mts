// SYNTHETIC provenance: inline source snippets exercise import-boundary rules only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatEngineBoundaryFindings,
  scanEngineBoundarySources,
  type EngineBoundarySource
} from '../../scripts/check-engine-boundary.mts';

function scan(source: EngineBoundarySource) {
  return scanEngineBoundarySources([source]);
}

test('allows engine-neutral code without diagram-js dependencies', () => {
  assert.deepEqual(scan({
    filePath: 'src/language/concept-registry.mts',
    text: "import { normalize } from '../model-dto/types.js';\nexport const value = normalize;\n"
  }), []);
});

test('rejects static diagram-js imports in engine-neutral sources', () => {
  assert.deepEqual(scan({
    filePath: 'src/layout/arrange.mts',
    text: "import Diagram from 'diagram-js';\nexport const diagram = Diagram;\n"
  }), [
    { filePath: 'src/layout/arrange.mts', rule: 'engine-boundary/import', subject: 'diagram-js' }
  ]);
});

test('allows only the documented adapter location', () => {
  const sources = [
    {
      filePath: 'src/diagram-js-adapter/index.mts',
      text: "export { default } from 'diagram-js/lib/Diagram.js';\n"
    }
  ];
  assert.deepEqual(scanEngineBoundarySources(sources), []);
});

test('rejects dynamic imports of diagram-js packages', () => {
  assert.deepEqual(scan({
    filePath: 'src/export/svg.mts',
    text: "export async function load() { return import('diagram-js/lib/core/EventBus.js'); }\n"
  }), [
    { filePath: 'src/export/svg.mts', rule: 'engine-boundary/import', subject: 'diagram-js/lib/core/EventBus.js' }
  ]);
});

test('rejects require calls for diagram-js direct editing', () => {
  assert.deepEqual(scan({
    filePath: 'src/lint/rules.mts',
    text: "const directEditing = require('diagram-js-direct-editing');\n"
  }), [
    { filePath: 'src/lint/rules.mts', rule: 'engine-boundary/import', subject: 'diagram-js-direct-editing' }
  ]);
});

test('rejects re-exports from diagram-js internals', () => {
  assert.deepEqual(scan({
    filePath: 'src/validator/index.ts',
    text: "export { default as Canvas } from 'diagram-js/lib/core/Canvas.js';\n"
  }), [
    { filePath: 'src/validator/index.ts', rule: 'engine-boundary/import', subject: 'diagram-js/lib/core/Canvas.js' }
  ]);
});

test('rejects diagram-js service lookups by string literal', () => {
  assert.deepEqual(scan({
    filePath: 'src/model-dto/editor.ts',
    text: "export function apply(modeler) { return modeler.get('commandStack'); }\n"
  }), [
    { filePath: 'src/model-dto/editor.ts', rule: 'engine-boundary/service-lookup', subject: 'commandStack' }
  ]);
});

test('formats deterministic content-free diagnostics', () => {
  const findings = scanEngineBoundarySources([
    { filePath: 'src/layout/z.mts', text: "modeler.get('selection');\n" },
    { filePath: 'src/layout/a.mts', text: "import Diagram from 'diagram-js';\n" }
  ]);
  assert.deepEqual(formatEngineBoundaryFindings(findings), [
    'src/layout/a.mts: engine-boundary/import: diagram-js',
    'src/layout/z.mts: engine-boundary/service-lookup: selection'
  ]);
});
