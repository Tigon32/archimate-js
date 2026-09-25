// SYNTHETIC: Uses only the hand-authored public-safe DTO exchange fixture.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are excluded from the browser source project.
import { readFileSync } from 'node:fs';
import {
  DiagramAdapter, importMeffToModelDto, serializeModelDto
} from '../../src/model-dto/index.js';

const fixture = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');
const viewId = 'view-dto-export';

function makeEditor(): DiagramAdapter {
  return new DiagramAdapter(importMeffToModelDto(fixture));
}

function makeEditorWithSecondView(): DiagramAdapter {
  const model = importMeffToModelDto(fixture);
  const firstView = model.views[0];
  model.views.push({
    id: 'second-view',
    nodes: [
      { ...structuredClone(firstView.nodes[0]), id: 'other-view-node', nodes: [] },
      { ...structuredClone(firstView.nodes[1]), id: 'other-view-target' }
    ],
    connections: [{
      ...structuredClone(firstView.connections[0]), id: 'other-view-connection',
      sourceId: 'other-view-node', targetId: 'other-view-target'
    }]
  });
  return new DiagramAdapter(model);
}

function element(id: string, type = 'archimate:ApplicationProcess') {
  return {
    id, type, name: 'Synthetic process', documentation: 'Synthetic creation.'
  };
}

function node(id: string, elementId: string) {
  return {
    id, kind: 'element' as const, elementId, x: 500, y: 40, width: 140, height: 70,
    label: 'Created node', style: { fill: '#102030', stroke: '#405060', lineWidth: 2 }, nodes: []
  };
}

function relationship(id: string, sourceId: string, targetId: string) {
  return {
    id, type: 'archimate:Assignment', sourceId, targetId, name: 'Synthetic assignment'
  };
}

function connection(id: string, relationshipId: string, sourceId: string, targetId: string) {
  return {
    id, kind: 'relationship' as const, relationshipId, sourceId, targetId,
    label: 'Created connection', style: { stroke: '#708090', lineWidth: 3 },
    waypoints: [
      { x: 160, y: 75, kind: 'sourceAttachment' as const },
      { x: 500, y: 75, kind: 'bendpoint' as const },
      { x: 500, y: 75, kind: 'targetAttachment' as const }
    ]
  };
}

it('creates an element and view node atomically with exact undo/redo and MEFF round-trip', () => {
  const editor = makeEditor();
  const before = editor.serialize();
  editor.execute({ type: 'create-element', viewId, element: element('process-three'),
    node: node('node-process', 'process-three') });
  const created = editor.getModel();
  expect(created.elements.at(-1)).toMatchObject({ id: 'process-three', type: 'archimate:ApplicationProcess' });
  expect(created.views[0].nodes.at(-1)).toMatchObject({
    id: 'node-process', label: 'Created node', style: { fill: '#102030' }
  });
  expect(serializeModelDto(importMeffToModelDto(editor.exportMeff()))).toBe(editor.serialize());
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(before);
  expect(editor.redo()).toBe(true);
  expect(editor.serialize()).toBe(serializeModelDto(created));
});

it('creates a reviewed semantic relationship and view connection as one history edit', () => {
  const editor = makeEditor();
  editor.execute({ type: 'create-element', viewId, element: element('process-three'),
    node: node('node-process', 'process-three') });
  const beforeRelationship = editor.serialize();
  editor.execute({ type: 'create-relationship', viewId,
    relationship: relationship('assignment-one-three', 'component-one', 'process-three'),
    connection: connection('assignment-connection', 'assignment-one-three',
      'node-component', 'node-process') });
  expect(editor.getModel().relationships.at(-1)).toMatchObject({
    id: 'assignment-one-three', sourceId: 'component-one', targetId: 'process-three'
  });
  expect(editor.getModel().views[0].connections.at(-1)).toMatchObject({
    id: 'assignment-connection', label: 'Created connection'
  });
  expect(serializeModelDto(importMeffToModelDto(editor.exportMeff()))).toBe(editor.serialize());
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(beforeRelationship);
  expect(editor.redo()).toBe(true);
});

it('rejects duplicate IDs and invalid element types without mutation or history changes', () => {
  const cases = [
    {
      command: { type: 'create-element' as const, viewId, element: element('component-one'),
        node: node('new-node', 'component-one') },
      code: 'DTO_CREATE_DUPLICATE_ID'
    },
    {
      command: { type: 'create-element' as const, viewId, element: element('bad-type', 'archimate:NotAnElement'),
        node: node('bad-node', 'bad-type') },
      code: 'DTO_CREATE_INVALID_ELEMENT'
    }
  ] as const;
  for (const item of cases) {
    const editor = makeEditor();
    const before = editor.serialize();
    expect(() => editor.execute(item.command)).toThrow(expect.objectContaining({ code: item.code }));
    expect(editor.serialize()).toBe(before);
    expect(editor.undo()).toBe(false);
  }

});

it('rejects invalid endpoints and semantic tuples without mutation or history changes', () => {
  const invalidEndpoint = makeEditor();
  const endpointBefore = invalidEndpoint.serialize();
  expect(() => invalidEndpoint.execute({ type: 'create-relationship', viewId,
    relationship: relationship('bad-endpoint', 'component-one', 'missing-element'),
    connection: connection('bad-endpoint-connection', 'bad-endpoint',
      'node-component', 'node-service') })).toThrow(expect.objectContaining({
        code: 'DTO_CREATE_ENDPOINT_INVALID'
      }));
  expect(invalidEndpoint.serialize()).toBe(endpointBefore);
  expect(invalidEndpoint.undo()).toBe(false);

  const unsupported = makeEditor();
  const unsupportedBefore = unsupported.serialize();
  expect(() => unsupported.execute({ type: 'create-relationship', viewId,
    relationship: { id: 'unsupported-relation', type: 'archimate:Serving',
      sourceId: 'component-one', targetId: 'service-two' },
    connection: connection('unsupported-connection', 'unsupported-relation',
      'node-component', 'node-service') })).toThrow(expect.objectContaining({
        code: 'DTO_RELATIONSHIP_UNSUPPORTED'
      }));
  expect(unsupported.serialize()).toBe(unsupportedBefore);
  expect(unsupported.undo()).toBe(false);

  const disallowedModel = importMeffToModelDto(fixture);
  disallowedModel.elements[0].type = 'archimate:ApplicationFunction';
  disallowedModel.elements[1].type = 'archimate:DataObject';
  const disallowed = new DiagramAdapter(disallowedModel);
  expect(() => disallowed.execute({ type: 'create-relationship', viewId,
    relationship: { id: 'disallowed-relation', type: 'archimate:Access',
      sourceId: 'service-two', targetId: 'component-one' },
    connection: connection('disallowed-connection', 'disallowed-relation',
      'node-service', 'node-component') })).toThrow(expect.objectContaining({
        code: 'DTO_RELATIONSHIP_DISALLOWED'
      }));
});

it('rejects relationship ID and connection conflicts before any candidate mutation', () => {
  const editor = makeEditor();
  const before = editor.serialize();
  expect(() => editor.execute({ type: 'create-relationship', viewId,
    relationship: relationship('serving-one-two', 'component-one', 'service-two'),
    connection: connection('new-connection', 'serving-one-two',
      'node-component', 'node-service') })).toThrow(expect.objectContaining({
        code: 'DTO_CREATE_DUPLICATE_ID'
      }));
  expect(() => editor.execute({ type: 'create-relationship', viewId,
    relationship: relationship('new-relation', 'component-one', 'service-two'),
    connection: connection('node-service', 'new-relation',
      'node-component', 'node-service') })).toThrow(expect.objectContaining({
        code: 'DTO_CREATE_CONNECTION_ID_CONFLICT'
      }));
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);
});

it('rejects semantic IDs colliding with objects in another view', () => {
  const elementEditor = makeEditorWithSecondView();
  expect(() => elementEditor.execute({ type: 'create-element', viewId, element: element('other-view-node'),
    node: node('new-element-node', 'other-view-node') })).toThrow(expect.objectContaining({
      code: 'DTO_CREATE_DUPLICATE_ID'
    }));
  const relationshipEditor = makeEditorWithSecondView();
  expect(() => relationshipEditor.execute({ type: 'create-relationship', viewId,
    relationship: relationship('other-view-connection', 'component-one', 'service-two'),
    connection: connection('new-relationship-connection', 'other-view-connection',
      'node-component', 'node-service') })).toThrow(expect.objectContaining({
      code: 'DTO_CREATE_DUPLICATE_ID'
    }));
});

it('rejects view IDs colliding with objects in another view', () => {
  const elementEditor = makeEditorWithSecondView();
  expect(() => elementEditor.execute({ type: 'create-element', viewId, element: element('new-element'),
    node: node('other-view-connection', 'new-element') })).toThrow(expect.objectContaining({
      code: 'DTO_CREATE_NODE_ID_CONFLICT'
    }));
  const relationshipEditor = makeEditorWithSecondView();
  expect(() => relationshipEditor.execute({ type: 'create-relationship', viewId,
    relationship: relationship('new-relationship', 'component-one', 'service-two'),
    connection: connection('other-view-node', 'new-relationship',
      'node-component', 'node-service') })).toThrow(expect.objectContaining({
      code: 'DTO_CREATE_CONNECTION_ID_CONFLICT'
    }));
});

it('rejects same-command semantic and view ID collisions atomically', () => {
    const elementEditor = makeEditor();
    const elementBefore = elementEditor.serialize();
    expect(() => elementEditor.execute({ type: 'create-element', viewId,
      element: element('same-element-id'), node: node('same-element-id', 'same-element-id')
    })).toThrow(expect.objectContaining({ code: 'DTO_CREATE_NODE_ID_CONFLICT' }));
    expect(elementEditor.serialize()).toBe(elementBefore);
    expect(elementEditor.undo()).toBe(false);

    const relationshipEditor = makeEditor();
    const relationshipBefore = relationshipEditor.serialize();
    expect(() => relationshipEditor.execute({ type: 'create-relationship', viewId,
      relationship: relationship('same-relationship-id', 'component-one', 'service-two'),
      connection: connection('same-relationship-id', 'same-relationship-id',
        'node-component', 'node-service')
    })).toThrow(expect.objectContaining({ code: 'DTO_CREATE_CONNECTION_ID_CONFLICT' }));
    expect(relationshipEditor.serialize()).toBe(relationshipBefore);
    expect(relationshipEditor.undo()).toBe(false);
});
