// SYNTHETIC: Uses only hand-authored public-safe MEFF exchange data.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import {
  DiagramAdapter, importMeffToModelDto, MAX_EDITOR_OPERATIONS, parseOperationLog,
  serializeOperationLog, validateOperationLog
} from '../../src/model-dto/index.js';
import type { EditorOperationLog, ModelDto } from '../../src/model-dto/index.js';

const fixtureXml = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');
const viewId = 'view-dto-export';

function fixture(): ModelDto {
  const model = importMeffToModelDto(fixtureXml);
  model.propertyDefinitions = [{ id: 'property-state', type: 'string', name: 'Synthetic state' }];
  model.elements[0].properties = [{ propertyDefinitionId: 'property-state',
    values: [{ value: 'Synthetic draft' }] }];
  return model;
}

function recordAllCommandVariants(editor: DiagramAdapter): void {
  editor.execute({ type: 'create-element', viewId, element: {
    id: 'process-new', type: 'archimate:ApplicationProcess', name: 'Synthetic process'
  }, node: { id: 'node-new', kind: 'element', elementId: 'process-new',
    x: 400, y: 30, width: 120, height: 60, nodes: [] } });
  editor.execute({ type: 'create-relationship', viewId, relationship: {
    id: 'assignment-new', type: 'archimate:Assignment',
    sourceId: 'component-one', targetId: 'process-new'
  }, connection: { id: 'assignment-connection', kind: 'relationship',
    relationshipId: 'assignment-new', sourceId: 'node-component', targetId: 'node-new',
    waypoints: [{ x: 140, y: 60, kind: 'sourceAttachment' },
      { x: 400, y: 60, kind: 'targetAttachment' }] } });
  editor.execute({ type: 'move', viewId, nodeId: 'node-new', x: 410, y: 40 });
  editor.execute({ type: 'move-many', viewId, moves: [
    { nodeId: 'node-new', x: 420, y: 50 }, { nodeId: 'node-service', x: 230, y: 40 }
  ] });
  editor.execute({ type: 'resize', viewId, nodeId: 'node-new',
    x: 420, y: 50, width: 140, height: 70 });
  editor.execute({ type: 'connect', viewId, connection: { id: 'line-new', kind: 'line',
    sourceId: 'node-component', targetId: 'node-new',
    waypoints: [{ x: 140, y: 60, kind: 'sourceAttachment' },
      { x: 420, y: 80, kind: 'targetAttachment' }] } });
  editor.execute({ type: 'reconnect', viewId, connectionId: 'line-new',
    sourceId: 'node-new', targetId: 'node-component',
    waypoints: [{ x: 420, y: 80, kind: 'sourceAttachment' },
      { x: 140, y: 60, kind: 'targetAttachment' }] });
  const model = editor.getModel();
  const view = model.views.find((item) => item.id === viewId)!;
  const node = view.nodes.find((item) => item.id === 'node-new')!;
  const line = view.connections.find((item) => item.id === 'line-new')!;
  editor.execute({ type: 'apply-layout-patch', viewId, side: 'after', patch: {
    viewId, nodes: [{ id: node.id,
      before: { x: node.x, y: node.y, width: node.width, height: node.height },
      after: { x: node.x + 10, y: node.y + 10, width: node.width, height: node.height } }],
    connections: [{ id: line.id, before: line.waypoints,
      after: line.waypoints.map((point) => ({ ...point, x: point.x + 10 })) }]
  } });
  editor.execute({ type: 'label', viewId, itemId: 'line-new', label: 'Synthetic line' });
  editor.execute({ type: 'concept-name', viewId, conceptId: 'component-one',
    name: 'Synthetic component after' });
  editor.execute({ type: 'concept-documentation', viewId, conceptId: 'serving-one-two',
    documentation: 'Synthetic relationship after.' });
  editor.execute({ type: 'property', viewId, conceptId: 'component-one',
    propertyDefinitionId: 'property-state', values: [{ value: 'Synthetic released' }] });
  editor.execute({ type: 'delete', viewId, itemId: 'line-new' });
  editor.execute({ type: 'delete-many', viewId, itemIds: ['assignment-connection'] });
  editor.execute({ type: 'delete', viewId, itemId: 'node-new' });
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrow(expect.objectContaining({ code }));
}

it('serializes every command variant deterministically and replays undo/redo exactly', () => {
  const source = new DiagramAdapter(fixture());
  recordAllCommandVariants(source);
  expect(source.undo()).toBe(true);
  expect(source.redo()).toBe(true);

  const json = source.serializeOperationLog('stable-client');
  expect(source.serializeOperationLog('stable-client')).toBe(json);
  expect(serializeOperationLog(parseOperationLog(json))).toBe(json);
  const log = parseOperationLog(json);
  expect(new Set(log.operations.filter((item) => item.action === 'command')
    .map((item) => item.command?.type))).toEqual(new Set([
    'create-element', 'create-relationship', 'move', 'move-many', 'resize', 'connect',
    'reconnect', 'apply-layout-patch', 'label', 'concept-name', 'concept-documentation',
    'property', 'delete', 'delete-many'
  ]));
  expect(log.operations.slice(-2).map((item) => item.action)).toEqual(['undo', 'redo']);
  expect(json).not.toContain('"diagnostics"');
  expect(json).not.toContain('"elements"');
  expect(json).not.toContain('"relationships"');
  expect(json).not.toContain('"views"');

  const replay = new DiagramAdapter(fixture());
  replay.replayOperationLog(log);
  expect(replay.getModel()).toEqual(source.getModel());
  expect(replay.serialize()).toBe(source.serialize());
});

it('canonicalizes command field order and returns detached operation values', () => {
  const first: EditorOperationLog = { schemaVersion: 1, clientId: 'stable-client',
    operations: [{ sequence: 1, operationId: 'stable-client:1', action: 'command',
      command: { type: 'move', viewId, nodeId: 'node-component', x: 30, y: 40 } }] };
  const second = { schemaVersion: 1, clientId: 'stable-client',
    operations: [{ command: { y: 40, x: 30, nodeId: 'node-component', viewId, type: 'move' },
      action: 'command', operationId: 'stable-client:1', sequence: 1 }] };
  expect(serializeOperationLog(first)).toBe(serializeOperationLog(second));

  const editor = new DiagramAdapter(fixture());
  editor.execute(first.operations[0].command!);
  const exported = editor.exportOperationLog('stable-client');
  exported.operations[0].command!.viewId = 'mutated';
  expect(editor.exportOperationLog('stable-client').operations[0].command?.viewId).toBe(viewId);
});

it('rejects malformed logs and rejected commands atomically without consuming sequence', () => {
  const source = new DiagramAdapter(fixture());
  source.execute({ type: 'move', viewId, nodeId: 'node-component', x: 30, y: 40 });
  const valid = source.exportOperationLog('stable-client');
  const target = new DiagramAdapter(fixture());
  const before = target.serialize();
  const emptyLog = target.serializeOperationLog('stable-client');

  const unsupported = structuredClone(valid);
  unsupported.schemaVersion = 2 as 1;
  expectCode(() => validateOperationLog(unsupported), 'EDITOR_OPERATION_VERSION_UNSUPPORTED');
  const gap = structuredClone(valid);
  gap.operations.push({ sequence: 3, operationId: 'stable-client:3', action: 'undo' });
  expectCode(() => target.replayOperationLog(gap), 'EDITOR_OPERATION_SEQUENCE_INVALID');
  const duplicate = structuredClone(valid);
  duplicate.operations.push({ sequence: 2, operationId: 'stable-client:1', action: 'undo' });
  expectCode(() => validateOperationLog(duplicate), 'EDITOR_OPERATION_ID_DUPLICATE');
  expectCode(() => parseOperationLog('{"schemaVersion":'), 'EDITOR_OPERATION_LOG_INVALID');

  const rejected = structuredClone(valid);
  const command = rejected.operations[0];
  if (command.action === 'command') command.command = {
    type: 'move', viewId, nodeId: 'missing-node', x: 50, y: 50
  };
  expectCode(() => target.replayOperationLog(rejected), 'EDITOR_OPERATION_COMMAND_REJECTED');
  expect(target.serialize()).toBe(before);
  expect(target.serializeOperationLog('stable-client')).toBe(emptyLog);
  const replay = new DiagramAdapter(fixture());
  replay.replayOperationLog(valid);
  expectCode(() => replay.replayOperationLog(valid), 'EDITOR_OPERATION_REPLAY_NOT_FRESH');

  expect(() => target.execute({ type: 'move', viewId, nodeId: 'missing-node', x: 1, y: 1 }))
    .toThrow();
  expect(target.serializeOperationLog('stable-client')).toBe(emptyLog);
  target.execute({ type: 'move', viewId, nodeId: 'node-component', x: 25, y: 35 });
  expect(target.exportOperationLog('stable-client').operations[0].sequence).toBe(1);
});

it('replays undo and redo as logged state transitions and omits no-op history calls', () => {
  const base = fixture();
  const editor = new DiagramAdapter(base);
  const empty = editor.serializeOperationLog('stable-client');
  expect(editor.undo()).toBe(false);
  expect(editor.redo()).toBe(false);
  expect(editor.serializeOperationLog('stable-client')).toBe(empty);

  editor.execute({ type: 'move', viewId, nodeId: 'node-component', x: 35, y: 45 });
  expect(editor.undo()).toBe(true);
  const undone = new DiagramAdapter(base);
  undone.replayOperationLog(editor.serializeOperationLog('stable-client'));
  expect(undone.getModel()).toEqual(editor.getModel());
  expect(editor.exportOperationLog('stable-client').operations.map((item) => item.action))
    .toEqual(['command', 'undo']);

  expect(editor.redo()).toBe(true);
  const redone = new DiagramAdapter(base);
  redone.replayOperationLog(editor.serializeOperationLog('stable-client'));
  expect(redone.getModel()).toEqual(editor.getModel());
  expect(editor.exportOperationLog('stable-client').operations.map((item) => item.action))
    .toEqual(['command', 'undo', 'redo']);
});

it('validates operation identity, schema, command shape, and stable client identifiers', () => {
  expectCode(() => serializeOperationLog({ schemaVersion: 1, clientId: 'stable-client',
    operations: [{ sequence: 1, operationId: 'other:1', action: 'undo' }] }),
  'EDITOR_OPERATION_ID_INVALID');
  expectCode(() => serializeOperationLog({ schemaVersion: 1, clientId: 'stable-client',
    operations: [{ sequence: 1, operationId: 'stable-client:1', action: 'command',
      command: { type: 'unknown', viewId } }] }), 'EDITOR_OPERATION_LOG_INVALID');
  expectCode(() => serializeOperationLog({ schemaVersion: 1, clientId: 'stable-client',
    operations: [{ sequence: 1, operationId: 'stable-client:1', action: 'command',
      command: { type: 'move-many', viewId, moves: [
        { nodeId: 'node-component', x: 1, y: 2, renderer: { id: 'transient' } }
      ] } }] }), 'EDITOR_OPERATION_LOG_INVALID');
  expectCode(() => new DiagramAdapter(fixture()).exportOperationLog('not stable'),
    'EDITOR_OPERATION_CLIENT_ID_INVALID');
});

it('rejects inherited object member names as command types with a stable code', () => {
  for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const log = JSON.parse(JSON.stringify({ schemaVersion: 1, clientId: 'stable-client',
      operations: [{ sequence: 1, operationId: 'stable-client:1', action: 'command',
        command: { type, viewId } }] }));
    expectCode(() => validateOperationLog(log), 'EDITOR_OPERATION_LOG_INVALID');
    expectCode(() => parseOperationLog(JSON.stringify(log)), 'EDITOR_OPERATION_LOG_INVALID');
  }
  const editor = new DiagramAdapter(fixture());
  expect(() => editor.execute({ type: 'constructor', viewId } as never))
    .toThrow(expect.objectContaining({ code: 'MODEL_DTO_INVALID' }));
});

it('rejects operations beyond the exportable limit without mutating state or history', () => {
  const editor = new DiagramAdapter(fixture());
  editor.execute({ type: 'move', viewId, nodeId: 'node-component', x: 30, y: 40 });
  const before = editor.serialize();
  // Simulate a full log without executing 100,000 snapshot-backed commands.
  Reflect.set(editor, 'operationSequence', MAX_EDITOR_OPERATIONS);
  expectCode(() => editor.execute({ type: 'move', viewId, nodeId: 'node-component', x: 50, y: 60 }),
    'EDITOR_OPERATION_SEQUENCE_INVALID');
  expect(editor.serialize()).toBe(before);
  expectCode(() => editor.undo(), 'EDITOR_OPERATION_SEQUENCE_INVALID');
  expect(editor.serialize()).toBe(before);
  Reflect.set(editor, 'operationSequence', 1);
  expect(editor.exportOperationLog('stable-client').operations).toHaveLength(1);
  expect(editor.undo()).toBe(true);
  expect(editor.redo()).toBe(true);
  expect(editor.serialize()).toBe(before);
});
