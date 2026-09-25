// SYNTHETIC: Uses the hand-authored dto-editable-profile MEFF fixture only.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import {
  checkMeffEditingEligibility, importMeffToModelDto, serializeModelDto
} from '../../src/model-dto/index.js';
import { DiagramAdapter } from '../../src/model-dto/index.js';

const fixture = readFileSync('test/fixtures/synthetic/dto-editable-profile.xml', 'utf8');

it('edits semantic names, documentation, and defined properties without changing view labels', () => {
  const eligibility = checkMeffEditingEligibility(fixture);
  expect(eligibility.eligible).toBe(true);
  if (!eligibility.eligible) throw new Error('expected the synthetic profile to be editable');
  const editor = new DiagramAdapter(eligibility.model);
  const original = editor.serialize();

  editor.execute({ type: 'concept-name', viewId: 'view-editable',
    conceptId: 'component-editable', name: 'Component After' });
  editor.execute({ type: 'concept-documentation', viewId: 'view-editable',
    conceptId: 'serving-editable', documentation: 'Updated synthetic relationship note.' });
  editor.execute({ type: 'property', viewId: 'view-editable',
    conceptId: 'component-editable', propertyDefinitionId: 'property-state',
    values: [{ value: 'Released' }] });
  editor.execute({ type: 'label', viewId: 'view-editable',
    itemId: 'node-editable', label: 'Different presentation label' });

  expect(editor.getModel().elements[0].name).toBe('Component After');
  expect(editor.getModel().views[0].nodes[0].label).toBe('Different presentation label');
  expect(editor.project('view-editable').nodes[0].name).toBe('Component After');
  const reimported = importMeffToModelDto(editor.exportMeff());
  expect(serializeModelDto(reimported)).toBe(editor.serialize());
  expect(reimported.views[0].nodes[0]).toMatchObject({
    label: 'Different presentation label', x: 20, y: 30, width: 120, height: 60,
    style: { stroke: '#0A141E', lineWidth: 3 }
  });

  for (let count = 0; count < 4; count++) expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(original);
  for (let count = 0; count < 4; count++) expect(editor.redo()).toBe(true);
  expect(editor.serialize()).toBe(serializeModelDto(reimported));
});

it('rejects unknown property references and unsupported MEFF fields without partial editing', () => {
  const imported = importMeffToModelDto(fixture);
  const invalid = structuredClone(imported);
  invalid.elements[0].properties![0].propertyDefinitionId = 'missing-definition';
  expect(() => new DiagramAdapter(invalid)).toThrow('This model is not eligible for DTO editing.');

  const editor = new DiagramAdapter(imported);
  const before = editor.serialize();
  expect(() => editor.execute({ type: 'property', viewId: 'view-editable',
    conceptId: 'component-editable', propertyDefinitionId: 'missing-definition',
    values: [{ value: 'SYNTHETIC rejected value' }] })).toThrow('The model DTO is invalid.');
  expect(() => editor.execute({ type: 'property', viewId: 'view-editable',
    conceptId: 'component-editable', propertyDefinitionId: 'property-state',
    values: [{ value: 42 as unknown as string }] })).toThrow('The model DTO is invalid.');
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);

  const unsupported = fixture.replace(
    '<name>Component Before</name>',
    '<name>Component Before</name><specialization>synthetic-specialization</specialization>'
  );
  expect(checkMeffEditingEligibility(unsupported)).toMatchObject({
    eligible: false, reasons: [{ code: 'DTO_UNSUPPORTED_FIELDS' }]
  });
});

it('removes a defined property through an undoable editor command', () => {
  const editor = new DiagramAdapter(importMeffToModelDto(fixture));
  const before = editor.serialize();
  editor.execute({ type: 'property', viewId: 'view-editable',
    conceptId: 'component-editable', propertyDefinitionId: 'property-state', values: [] });
  expect(editor.getModel().elements[0].properties).toBeUndefined();
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(before);
});
