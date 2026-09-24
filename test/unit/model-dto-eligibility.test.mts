import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import {
  checkMeffEditingEligibility, createDtoEditorFromMeff, importMeffToModelDto, DiagramAdapter
} from '../../src/model-dto/index.js';

const supportedXml = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');
const unsupportedXml = readFileSync('test/fixtures/meff-schema/valid-view-presentation.xml', 'utf8');

it('creates a DTO editor only for imports that survive the export round trip', () => {
  const result = checkMeffEditingEligibility(supportedXml);
  expect(result.eligible).toBe(true);
  if (!result.eligible) throw new Error('expected the synthetic DTO fixture to be supported');
  const entry = createDtoEditorFromMeff(supportedXml);
  expect(entry.eligible).toBe(true);
  if (!entry.eligible) throw new Error('expected the synthetic DTO fixture to create an editor');
  expect(entry.editor).toBeInstanceOf(DiagramAdapter);
  expect(entry.editor.getModel()).toEqual(result.model);
});

it('rejects imports with omitted fields and never returns a partial editable model', () => {
  const result = checkMeffEditingEligibility(unsupportedXml);
  expect(result).toEqual({ eligible: false, reasons: [{
    code: 'DTO_UNSUPPORTED_FIELDS',
    message: 'This model contains fields that DTO editing cannot preserve.'
  }] });
  const entry = createDtoEditorFromMeff(unsupportedXml);
  expect(entry.eligible).toBe(false);
  if (entry.eligible) throw new Error('an import with omitted fields must not create an editor');
  expect(entry).not.toHaveProperty('model');
  expect(entry).not.toHaveProperty('editor');
  expect(JSON.stringify(entry)).not.toContain('valid-view-presentation');
});

it('rejects unsupported DTO presentation shapes at the adapter boundary without mutating input', () => {
  const model = importMeffToModelDto(supportedXml);
  model.views[0].nodes[0].kind = 'container';
  const before = structuredClone(model);
  expect(() => new DiagramAdapter(model)).toThrow(expect.objectContaining({
    code: 'DTO_EDITING_INELIGIBLE', message: 'This model is not eligible for DTO editing.'
  }));
  expect(model).toEqual(before);
});

it('maps malformed MEFF to a stable content-free reason', () => {
  const marker = 'SYNTHETIC_PRIVATE_IMPORT_MARKER';
  const result = checkMeffEditingEligibility(`<model>${marker}</model><`);
  expect(result).toEqual({ eligible: false, reasons: [{
    code: 'MEFF_DTO_IMPORT_INVALID',
    message: 'This MEFF model cannot be imported for DTO editing.'
  }] });
  expect(JSON.stringify(result)).not.toContain(marker);
});
