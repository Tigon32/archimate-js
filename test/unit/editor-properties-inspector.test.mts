// SYNTHETIC: Exercises the hand-authored dto-editable-profile fixture only.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import {
  createEditorPropertiesInspector, DiagramAdapter, importMeffToModelDto,
  serializeModelDto
} from '../../src/model-dto/index.js';
import type { EditorInspectorField } from '../../src/model-dto/index.js';

const fixture = readFileSync('test/fixtures/synthetic/dto-editable-profile.xml', 'utf8');
const viewId = 'view-editable';

function editor(): DiagramAdapter {
  return new DiagramAdapter(importMeffToModelDto(fixture));
}

function field(fields: EditorInspectorField[], key: string): EditorInspectorField {
  const found = fields.find((item) => item.key === key);
  if (!found) throw new Error(`Expected inspector field ${key}.`);
  return found;
}

function operationCount(adapter: DiagramAdapter): number {
  return adapter.exportOperationLog('synthetic-client').operations.length;
}

function json(adapter: DiagramAdapter): unknown {
  return JSON.parse(adapter.serialize());
}

it('describes and edits selected element names through DTO-owned commands', () => {
  const adapter = editor();
  const inspector = createEditorPropertiesInspector(adapter, viewId);
  adapter.select(viewId, ['node-editable']);

  const inspection = inspector.inspect();
  expect(inspection).toMatchObject({
    status: 'ready',
    target: { kind: 'element', itemId: 'node-editable', conceptId: 'component-editable' }
  });
  expect(field(inspection.fields, 'name')).toMatchObject({
    availability: 'available', value: 'Component Before'
  });
  expect(field(inspection.fields, 'concept-type')).toMatchObject({
    availability: 'read-only', value: 'archimate:ApplicationComponent'
  });
  expect(field(inspection.fields, 'node-geometry')).toMatchObject({ availability: 'unavailable' });

  inspector.setName('Component After');
  expect(adapter.getModel().elements.find((item) => item.id === 'component-editable')?.name)
    .toBe('Component After');
  expect(operationCount(adapter)).toBe(1);
});

it('describes and edits selected relationship names and documentation', () => {
  const adapter = editor();
  const inspector = createEditorPropertiesInspector(adapter, viewId);
  adapter.select(viewId, ['serving-edge']);

  const inspection = inspector.inspect();
  expect(inspection).toMatchObject({
    status: 'ready',
    target: { kind: 'relationship', itemId: 'serving-edge', conceptId: 'serving-editable' }
  });
  expect(field(inspection.fields, 'relationship-source')).toMatchObject({
    availability: 'read-only', value: 'component-editable'
  });
  inspector.setName('Serving After');
  inspector.setDocumentation('Updated synthetic relationship documentation.');

  const relationship = adapter.getModel().relationships.find((item) => item.id === 'serving-editable');
  expect(relationship).toMatchObject({
    name: 'Serving After',
    documentation: 'Updated synthetic relationship documentation.'
  });
  expect(operationCount(adapter)).toBe(2);
});

it('lists supported property definitions and edits property values', () => {
  const adapter = editor();
  const inspector = createEditorPropertiesInspector(adapter, viewId);
  adapter.select(viewId, ['node-editable']);

  const inspection = inspector.inspect();
  expect(field(inspection.fields, 'property:property-state')).toMatchObject({
    availability: 'available',
    propertyDefinition: { id: 'property-state', type: 'string' },
    value: [{ value: 'Draft' }]
  });
  inspector.setProperty('property-state', [{ value: 'Released' }]);

  expect(adapter.getModel().elements.find((item) => item.id === 'component-editable')?.properties)
    .toEqual([{ propertyDefinitionId: 'property-state', values: [{ value: 'Released' }] }]);
});

it('rejects invalid edits without changing model or history', () => {
  const adapter = editor();
  const inspector = createEditorPropertiesInspector(adapter, viewId);
  adapter.select(viewId, ['node-editable']);
  const beforeModel = json(adapter);
  const beforeHistory = operationCount(adapter);

  expect(() => inspector.setProperty('missing-definition', [{ value: 'Rejected' }]))
    .toThrow('The model DTO is invalid.');
  expect(json(adapter)).toEqual(beforeModel);
  expect(operationCount(adapter)).toBe(beforeHistory);
  expect(adapter.undo()).toBe(false);
});

it('emits fresh descriptions for selection changes and empty selection', () => {
  const adapter = editor();
  const inspector = createEditorPropertiesInspector(adapter, viewId);
  const statuses: string[] = [];
  const targets: Array<string | undefined> = [];
  const unsubscribe = inspector.subscribe((inspection) => {
    statuses.push(inspection.status);
    targets.push(inspection.target?.conceptId);
  });

  adapter.select(viewId, ['node-editable']);
  adapter.select(viewId, ['serving-edge']);
  adapter.select(viewId, []);
  unsubscribe();

  expect(statuses).toEqual(['empty', 'ready', 'ready', 'empty']);
  expect(targets).toEqual([undefined, 'component-editable', 'serving-editable', undefined]);
  expect(inspector.inspect()).toMatchObject({
    status: 'empty',
    reason: 'No selected item.',
    fields: []
  });
});

it('reports unavailable fields and multiple selections without silently dropping reasons', () => {
  const adapter = editor();
  const inspector = createEditorPropertiesInspector(adapter, viewId);

  expect(inspector.inspect(['node-editable', 'serving-edge'])).toMatchObject({
    status: 'multiple',
    reason: 'Select one element or relationship to edit inspector fields.'
  });
  const inspection = inspector.inspect(['node-editable']);
  expect(field(inspection.fields, 'presentation-label')).toMatchObject({
    availability: 'unavailable',
    reason: 'Presentation fields are edited by canvas commands, not this profile-safe concept inspector.'
  });
  expect(field(inspection.fields, 'concept-id')).toMatchObject({
    availability: 'read-only',
    reason: 'Concept identity and type are outside the accepted editable DTO inspector profile.'
  });
});

it('keeps undo and redo working after an inspector edit', () => {
  const adapter = editor();
  const inspector = createEditorPropertiesInspector(adapter, viewId);
  adapter.select(viewId, ['node-editable']);
  const before = adapter.serialize();
  inspector.setDocumentation('Inspector-authored synthetic documentation.');
  const after = adapter.serialize();

  expect(after).not.toBe(before);
  expect(adapter.undo()).toBe(true);
  expect(adapter.serialize()).toBe(before);
  expect(adapter.redo()).toBe(true);
  expect(adapter.serialize()).toBe(after);
  expect(serializeModelDto(adapter.getModel())).toBe(after);
});
