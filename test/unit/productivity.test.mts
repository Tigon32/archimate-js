// SYNTHETIC: Uses the checked-in public-safe DTO fixture and deterministic IDs.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are excluded from the browser source project.
import { readFileSync } from 'node:fs';
import {
  alignSelectionCommand,
  distributeSelectionCommand,
  duplicateSelectionCommand
} from '../../src/modeler/productivity.js';
import { DiagramAdapter, importMeffToModelDto } from '../../src/model-dto/index.js';

const fixture = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');

function editorForAllowedPair(): DiagramAdapter {
  const model = importMeffToModelDto(fixture);
  model.elements.find((item) => item.id === 'component-one')!.type = 'archimate:ApplicationProcess';
  model.elements.find((item) => item.id === 'service-two')!.type = 'archimate:ApplicationProcess';
  model.relationships[0].type = 'archimate:Flow';
  return new DiagramAdapter(model);
}

function idFactory() {
  let sequence = 1;
  return (kind: string) => `synthetic-${kind}-${sequence++}`;
}

it('duplicates selected semantic elements, nested nodes, and internal relationships atomically', () => {
  const editor = editorForAllowedPair();
  editor.select('view-dto-export', ['node-component', 'node-service']);
  const projection = editor.project('view-dto-export');
  const before = editor.serialize();
  const command = duplicateSelectionCommand(editor.getModel(), projection,
    idFactory(), { x: 30, y: 25 })!;
  expect(command.elements).toHaveLength(2);
  expect(command.nodes).toHaveLength(3);
  expect(command.relationships).toHaveLength(1);
  expect(command.connections).toHaveLength(1);
  const [root, nested, secondRoot] = command.nodes;
  const originalRoot = projection.nodes.find((node) => node.id === 'node-component')!;
  const originalNested = projection.nodes.find((node) => node.id === 'node-service-nested')!;
  const originalSecondRoot = projection.nodes.find((node) => node.id === 'node-service')!;
  expect(root).toMatchObject({ node: { kind: 'element',
    x: originalRoot.x + 30, y: originalRoot.y + 25 } });
  expect(root.parentId).toBeUndefined();
  expect(nested).toMatchObject({ parentId: root.node.id, node: { kind: 'element',
    x: originalNested.x + 30, y: originalNested.y + 25 } });
  expect(secondRoot).toMatchObject({ node: { kind: 'element',
    x: originalSecondRoot.x + 30, y: originalSecondRoot.y + 25 } });
  expect(secondRoot.parentId).toBeUndefined();
  editor.execute(command);
  const created = editor.getModel();
  expect(created.elements).toHaveLength(4);
  expect(created.relationships).toHaveLength(2);
  expect(created.views[0].nodes.find((node) => node.id === root.node.id)?.nodes[0]?.id)
    .toBe(nested.node.id);
  const log = editor.serializeOperationLog('synthetic-productivity');
  const replay = editorForAllowedPair();
  replay.replayOperationLog(log);
  expect(replay.serialize()).toBe(editor.serialize());
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(before);
  expect(editor.redo()).toBe(true);
});

it('aligns selected nodes through one move-many command', () => {
  const editor = editorForAllowedPair();
  editor.select('view-dto-export', ['node-component', 'node-service']);
  const command = alignSelectionCommand(editor.project('view-dto-export'), 'top')!;
  expect(command.type).toBe('move-many');
  editor.execute(command);
  const nodes = editor.project('view-dto-export').nodes
    .filter((node) => ['node-component', 'node-service'].includes(node.id));
  expect(new Set(nodes.map((node) => node.y)).size).toBe(1);
  expect(editor.undo()).toBe(true);
});

it('distributes three selected nodes while preserving the outer positions', () => {
  const editor = editorForAllowedPair();
  editor.execute({
    type: 'create-element',
    viewId: 'view-dto-export',
    element: { id: 'third-process', type: 'archimate:ApplicationProcess' },
    node: { id: 'node-third', kind: 'element', elementId: 'third-process',
      x: 600, y: 40, width: 140, height: 70, nodes: [] }
  });
  editor.select('view-dto-export', ['node-component', 'node-service', 'node-third']);
  const command = distributeSelectionCommand(editor.project('view-dto-export'), 'horizontal')!;
  editor.execute(command);
  const nodes = editor.project('view-dto-export').nodes
    .filter((node) => ['node-component', 'node-service', 'node-third'].includes(node.id))
    .sort((left, right) => left.x - right.x);
  expect(nodes[0].x).toBe(20);
  expect(nodes[2].x).toBe(600);
  expect(nodes[1].x - (nodes[0].x + nodes[0].width))
    .toBe(nodes[2].x - (nodes[1].x + nodes[1].width));
});

it('returns no command when selection cardinality cannot support the action', () => {
  const editor = editorForAllowedPair();
  editor.select('view-dto-export', ['node-component']);
  expect(alignSelectionCommand(editor.project('view-dto-export'), 'left')).toBeUndefined();
  expect(distributeSelectionCommand(editor.project('view-dto-export'), 'horizontal')).toBeUndefined();
  expect(duplicateSelectionCommand(editor.getModel(),
    { ...editor.project('view-dto-export'), selectedIds: ['serving-connection'] },
    idFactory())).toBeUndefined();
});

it('rejects a duplicate payload collision atomically', () => {
  const editor = editorForAllowedPair();
  editor.select('view-dto-export', ['node-service']);
  const command = duplicateSelectionCommand(editor.getModel(), editor.project('view-dto-export'),
    idFactory())!;
  command.elements[0].id = 'component-one';
  command.nodes[0].node.elementId = 'component-one';
  const before = editor.serialize();
  expect(() => editor.execute(command)).toThrow();
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);
});

it('rejects malformed hierarchy and unrelated semantic references without partial edits', () => {
  const editor = editorForAllowedPair();
  editor.select('view-dto-export', ['node-component', 'node-service']);
  const original = editor.serialize();
  const command = duplicateSelectionCommand(editor.getModel(), editor.project('view-dto-export'),
    idFactory())!;
  const malformed = structuredClone(command);
  malformed.nodes[0].node.nodes.push(structuredClone(malformed.nodes[1].node));
  expect(() => editor.execute(malformed)).toThrow();
  const foreign = structuredClone(command);
  foreign.connections[0].sourceId = 'node-component';
  expect(() => editor.execute(foreign)).toThrow();
  const unused = structuredClone(command);
  unused.relationships.push({ ...unused.relationships[0], id: 'synthetic-unused' });
  expect(() => editor.execute(unused)).toThrow();
  expect(editor.serialize()).toBe(original);
  expect(editor.undo()).toBe(false);
  expect(() => duplicateSelectionCommand(editor.getModel(), editor.project('view-dto-export'),
    idFactory(), { x: Number.NaN, y: 0 })).toThrow();
});

it('emits no command for container or label descendants in the DTO or supplied projection', () => {
  const source = editorForAllowedPair();
  const model = source.getModel();
  const projection = source.project('view-dto-export');
  const parent = model.views[0].nodes.find((node) => node.id === 'node-component')!;
  const container: typeof parent = {
    id: 'synthetic-container', kind: 'container', conceptRef: 'container-ref',
    x: 25, y: 100, width: 150, height: 100, nodes: [
      { id: 'synthetic-label', kind: 'label', xpathPart: 'label-path',
        x: 40, y: 165, width: 80, height: 20, label: 'Synthetic label', nodes: [] }
    ]
  };
  parent.nodes.push(structuredClone(container));
  let generated = 0;
  const createId = (kind: string) => { generated++; return `synthetic-${kind}-${generated}`; };
  const selectedProjection = { ...projection, selectedIds: ['node-component'] };
  expect(duplicateSelectionCommand(model, selectedProjection, createId)).toBeUndefined();
  expect(duplicateSelectionCommand(source.getModel(), {
    ...selectedProjection,
    nodes: [...projection.nodes,
      { id: container.id, kind: 'container' as const, parentId: parent.id,
        x: container.x, y: container.y, width: container.width, height: container.height }]
  }, createId)).toBeUndefined();
  expect(duplicateSelectionCommand(model, {
    ...selectedProjection, selectedIds: [container.id]
  }, createId)).toBeUndefined();
  const label = container.nodes[0];
  const labelModel = source.getModel();
  labelModel.views[0].nodes[0].nodes.push({ ...label, nodes: [] });
  expect(duplicateSelectionCommand(labelModel, selectedProjection, createId)).toBeUndefined();
  expect(duplicateSelectionCommand(source.getModel(), {
    ...selectedProjection,
    nodes: [...projection.nodes, { id: label.id, kind: 'label', parentId: parent.id,
      x: label.x, y: label.y, width: label.width, height: label.height }]
  }, createId)).toBeUndefined();
  expect(generated).toBe(0);
  expect(source.getModel().views[0].nodes.find((node) => node.id === parent.id)?.nodes)
    .toHaveLength(1);
});

it('allows multiple duplicated view connections to reference one duplicated relationship', () => {
  const model = editorForAllowedPair().getModel();
  model.views[0].connections.push({
    ...structuredClone(model.views[0].connections[0]),
    id: 'second-flow-presentation',
    sourceId: 'node-component',
    targetId: 'node-service-nested'
  });
  const editor = new DiagramAdapter(model);
  editor.select('view-dto-export', ['node-component', 'node-service']);
  const command = duplicateSelectionCommand(editor.getModel(), editor.project('view-dto-export'),
    idFactory())!;
  expect(command.relationships).toHaveLength(1);
  expect(command.connections).toHaveLength(2);
  expect(new Set(command.connections.map((connection) => connection.relationshipId)).size).toBe(1);
  expect(() => editor.execute(command)).not.toThrow();
  expect(editor.getModel().views[0].connections).toHaveLength(4);
});

it('duplicates profile-reviewed relationships using the editor profile during replay', () => {
  const model = importMeffToModelDto(fixture);
  model.elements.find((item) => item.id === 'component-one')!.type = 'archimate:BusinessActor';
  model.elements.find((item) => item.id === 'service-two')!.type = 'archimate:TechnologyService';
  const semanticProfile = {
    id: 'synthetic-duplicate-profile',
    version: '2026.09',
    kind: 'organization',
    rows: [{
      archimateVersion: '3.2',
      sourceType: 'BusinessActor',
      relationshipType: 'ServingRelationship',
      targetType: 'TechnologyService',
      decision: 'allowed',
      evidenceSourceId: 'profile:synthetic-duplicate',
      nonNormative: true,
      interpretation: 'SYNTHETIC editor duplication profile.'
    }]
  };
  const editor = new DiagramAdapter(model, { semanticProfile });
  editor.select('view-dto-export', ['node-component', 'node-service']);
  const command = duplicateSelectionCommand(editor.getModel(), editor.project('view-dto-export'),
    idFactory())!;
  expect(command.relationships).toHaveLength(1);
  const baseline = new DiagramAdapter(model);
  expect(() => baseline.execute(command)).toThrow(
    expect.objectContaining({ code: 'DTO_RELATIONSHIP_UNSUPPORTED' }));
  editor.execute(command);
  const replay = new DiagramAdapter(model, { semanticProfile });
  replay.replayOperationLog(editor.serializeOperationLog('synthetic-profile-duplicate'));
  expect(replay.serialize()).toBe(editor.serialize());
  expect(editor.undo()).toBe(true);
  expect(editor.redo()).toBe(true);
  expect(editor.serialize()).toBe(replay.serialize());
});
