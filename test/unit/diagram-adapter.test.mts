// SYNTHETIC: Hand-authored architecture IDs and geometry; no external model data.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import { DiagramAdapter, importMeffToModelDto, parseModelDto, serializeModelDto } from '../../src/model-dto/index.js';
import type { CanvasPort, CanvasProjection, EditorCommand, ModelDto } from '../../src/model-dto/index.js';

function fixture(): ModelDto {
  return { schemaVersion: 1, id: 'synthetic-model', elements: [
    { id: 'element-a', type: 'archimate:ApplicationComponent', name: 'A' },
    { id: 'element-b', type: 'archimate:ApplicationComponent', name: 'B' }
  ], relationships: [{ id: 'relation-ab', type: 'archimate:Serving',
    sourceId: 'element-a', targetId: 'element-b' }], diagnostics: [], views: [
    { id: 'view-one', nodes: [
      { id: 'container-one', kind: 'container', x: 0, y: 0, width: 300, height: 200,
        nodes: [{ id: 'node-a', kind: 'element', elementId: 'element-a',
          x: 20, y: 30, width: 70, height: 40, nodes: [] }] },
      { id: 'node-b', kind: 'element', elementId: 'element-b',
        x: 180, y: 30, width: 70, height: 40, nodes: [] }
    ], connections: [{ id: 'connection-ab', kind: 'relationship', relationshipId: 'relation-ab',
      sourceId: 'node-a', targetId: 'node-b', waypoints: [
        { x: 90, y: 50, kind: 'sourceAttachment' },
        { x: 180, y: 50, kind: 'targetAttachment' }
      ] }] },
    { id: 'view-two', nodes: [], connections: [] }
  ] };
}

it('updates nested geometry and edge attachments through undoable commands', () => {
  const editor = new DiagramAdapter(fixture());
  const before = editor.serialize();
  editor.execute({ type: 'move', viewId: 'view-one', nodeId: 'container-one', x: 10, y: 15 });
  const projected = editor.project('view-one');
  expect(projected.nodes.find((node) => node.id === 'node-a')).toMatchObject({
    parentId: 'container-one', x: 30, y: 45
  });
  expect(projected.connections[0].waypoints[0]).toMatchObject({ x: 100, y: 65 });
  editor.execute({ type: 'resize', viewId: 'view-one', nodeId: 'node-b',
    x: 180, y: 30, width: 95, height: 55 });
  expect(editor.project('view-one').nodes.find((node) => node.id === 'node-b')?.width).toBe(95);
  expect(editor.undo()).toBe(true);
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(before);
  expect(editor.redo()).toBe(true);
  expect(editor.redo()).toBe(true);
  expect(parseModelDto(editor.serialize())).toEqual(editor.getModel());
});

it('connects, reconnects, labels and deletes without persisting canvas objects', () => {
  const editor = new DiagramAdapter(fixture());
  const original = editor.serialize();
  editor.execute({ type: 'connect', viewId: 'view-one', connection: {
    id: 'line-one', kind: 'line', sourceId: 'node-a', targetId: 'node-b',
    waypoints: [{ x: 40, y: 50 }, { x: 200, y: 50 }]
  } });
  editor.execute({ type: 'reconnect', viewId: 'view-one', connectionId: 'line-one',
    sourceId: 'node-b', targetId: 'node-a', waypoints: [{ x: 200, y: 50 }, { x: 40, y: 50 }] });
  editor.execute({ type: 'label', viewId: 'view-one', itemId: 'line-one', label: 'Synthetic line' });
  editor.select('view-one', ['node-a', 'line-one']);
  editor.execute({ type: 'delete', viewId: 'view-one', itemId: 'container-one' });
  expect(editor.project('view-one').nodes.map((node) => node.id)).toEqual(['node-b']);
  expect(editor.project('view-one').connections).toEqual([]);
  expect(editor.project('view-one').selectedIds).toEqual([]);
  expect(editor.getModel().elements).toHaveLength(2);
  for (let i = 0; i < 4; i++) expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(original);
  expect(editor.redo()).toBe(true);
  editor.execute({ type: 'delete', viewId: 'view-one', itemId: 'line-one' });
  expect(editor.redo()).toBe(false);
});

it('validates every command atomically and never accepts a diagram-js-shaped payload', () => {
  const editor = new DiagramAdapter(fixture());
  const original = editor.serialize();
  const invalid = [
    { type: 'move', viewId: 'view-one', nodeId: 'node-a', x: Infinity, y: 1 },
    { type: 'resize', viewId: 'view-one', nodeId: 'node-a', x: 1, y: 1, width: -1, height: 1 },
    { type: 'reconnect', viewId: 'view-one', connectionId: 'connection-ab',
      sourceId: 'missing', targetId: 'node-b', waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
    { type: 'delete', viewId: 'view-one', itemId: 'missing' }
  ] as EditorCommand[];
  for (const command of invalid) expect(() => editor.execute(command)).toThrow();
  expect(editor.serialize()).toBe(original);
  expect(editor.undo()).toBe(false);
  const snapshot = editor.getModel();
  snapshot.views[0].nodes[0].x = 999;
  const projection = editor.project('view-one');
  projection.nodes[0].x = 999;
  expect(editor.serialize()).toBe(original);
  expect(editor.serialize()).not.toContain('businessObject');
  const privateValue = 'synthetic-private-value';
  expect(() => new DiagramAdapter({ ...fixture(), businessObject: privateValue }))
    .toThrow('The model DTO is invalid.');
  expect(() => editor.execute({ type: 'connect', viewId: 'view-one', connection: {
    id: 'line-extra', kind: 'line', waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    businessObject: { secret: privateValue }
  } } as unknown as EditorCommand)).toThrow('The model DTO is invalid.');
  expect(editor.serialize()).toBe(original);
});

it('binds an ID-only canvas port and emits detached state with the edited view ID', () => {
  const editor = new DiagramAdapter(fixture());
  const renders: CanvasProjection[] = [];
  let onCommand: ((command: EditorCommand) => void) | undefined;
  let onSelection: ((ids: string[]) => void) | undefined;
  const port: CanvasPort = {
    render: (projection) => { renders.push(projection); },
    onCommand: (handler) => { onCommand = handler; return () => { onCommand = undefined; }; },
    onSelection: (handler) => { onSelection = handler; return () => { onSelection = undefined; }; }
  };
  const events: string[] = [];
  editor.subscribe((event) => { events.push(`${event.type}:${event.viewId}`); event.model.id = 'modified'; });
  const detach = editor.attach('view-one', port);
  onSelection?.(['node-a']);
  onCommand?.({ type: 'label', viewId: 'view-one', itemId: 'node-a', label: 'New label' });
  expect(() => onCommand?.({ type: 'connect', viewId: 'view-two', connection: {
    id: 'line-two', kind: 'line', waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
  } })).toThrow();
  editor.execute({ type: 'connect', viewId: 'view-two', connection: {
    id: 'line-two', kind: 'line', waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
  } });
  expect(events).toEqual(['selection:view-one', 'changed:view-one', 'changed:view-two']);
  editor.undo();
  expect(events.at(-1)).toBe('changed:view-two');
  expect(editor.getModel().id).toBe('synthetic-model');
  expect(renders.every((value) => value.viewId === 'view-one')).toBe(true);
  detach();
  expect(onCommand).toBeUndefined();
  expect(onSelection).toBeUndefined();
});

it('exports the edited DTO through the fail-closed MEFF boundary', () => {
  const xml = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');
  const editor = new DiagramAdapter(importMeffToModelDto(xml));
  const view = editor.getModel().views[0];
  editor.execute({ type: 'move', viewId: view.id, nodeId: view.nodes[0].id,
    x: view.nodes[0].x + 10, y: view.nodes[0].y + 10 });
  const exported = importMeffToModelDto(editor.exportMeff());
  expect(serializeModelDto(exported)).toBe(editor.serialize());

  const unsupported = new DiagramAdapter(fixture());
  expect(() => unsupported.exportMeff()).toThrow('Unable to export the ArchiMate model DTO as MEFF.');
});
