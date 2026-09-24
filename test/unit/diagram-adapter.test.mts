// SYNTHETIC: Hand-authored architecture IDs and geometry; no external model data.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import { DiagramAdapter, importMeffToModelDto, parseModelDto, serializeModelDto } from '../../src/model-dto/index.js';
import type { CanvasPort, CanvasProjection, EditorCommand, ModelDto } from '../../src/model-dto/index.js';

function fixture(): ModelDto {
  const model = importMeffToModelDto(readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8'));
  model.views.push({ id: 'view-two', nodes: [], connections: [] });
  return model;
}

it('updates nested geometry and edge attachments through undoable commands', () => {
  const editor = new DiagramAdapter(fixture());
  const before = editor.serialize();
  editor.execute({ type: 'move', viewId: 'view-dto-export', nodeId: 'node-service', x: 310, y: 50 });
  const projected = editor.project('view-dto-export');
  expect(projected.nodes.find((node) => node.id === 'node-service')).toMatchObject({ x: 310, y: 50 });
  expect(projected.connections[0].waypoints.at(-1)).toMatchObject({ x: 310, y: 85 });
  editor.execute({ type: 'resize', viewId: 'view-dto-export', nodeId: 'node-service',
    x: 310, y: 50, width: 150, height: 80 });
  expect(editor.project('view-dto-export').nodes.find((node) => node.id === 'node-service')?.width).toBe(150);
  expect(editor.undo()).toBe(true);
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(before);
  expect(editor.redo()).toBe(true);
  expect(editor.redo()).toBe(true);
  expect(parseModelDto(editor.serialize())).toEqual(editor.getModel());
});

it('projects semantic display values and styles without exposing mutable source data', () => {
  const editor = new DiagramAdapter(fixture());
  const projection = editor.project('view-dto-export');
  expect(projection.nodes.find((node) => node.id === 'node-component')).toMatchObject({
    type: 'archimate:ApplicationComponent', name: 'Component One',
    style: { stroke: '#14283C80', lineWidth: 7 }
  });
  expect(projection.connections[0]).toMatchObject({
    relationshipId: 'serving-one-two', type: 'archimate:Serving', name: 'Serves'
  });
  expect(JSON.stringify(projection)).not.toMatch(/businessObject|\$parent|\$type/);
  if (projection.nodes[0].style) projection.nodes[0].style.lineWidth = 900;
  expect(editor.project('view-dto-export').nodes[0].style?.lineWidth).toBe(7);
});

it('connects, reconnects, labels and deletes without persisting canvas objects', () => {
  const editor = new DiagramAdapter(fixture());
  const original = editor.serialize();
  editor.execute({ type: 'connect', viewId: 'view-dto-export', connection: {
    id: 'line-one', kind: 'line', sourceId: 'node-component', targetId: 'node-service',
    waypoints: [{ x: 40, y: 50 }, { x: 200, y: 50 }]
  } });
  editor.execute({ type: 'reconnect', viewId: 'view-dto-export', connectionId: 'line-one',
    sourceId: 'node-service', targetId: 'node-component', waypoints: [{ x: 200, y: 50 }, { x: 40, y: 50 }] });
  editor.execute({ type: 'label', viewId: 'view-dto-export', itemId: 'line-one', label: 'Synthetic line' });
  editor.select('view-dto-export', ['node-component', 'line-one']);
  editor.execute({ type: 'delete', viewId: 'view-dto-export', itemId: 'node-component' });
  expect(editor.project('view-dto-export').nodes.map((node) => node.id)).toEqual(['node-service']);
  expect(editor.project('view-dto-export').connections).toEqual([]);
  expect(editor.project('view-dto-export').selectedIds).toEqual([]);
  expect(editor.getModel().elements).toHaveLength(2);
  for (let i = 0; i < 4; i++) expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(original);
  expect(editor.redo()).toBe(true);
  editor.execute({ type: 'delete', viewId: 'view-dto-export', itemId: 'line-one' });
  expect(editor.redo()).toBe(false);
});

it('validates every command atomically and never accepts a diagram-js-shaped payload', () => {
  const editor = new DiagramAdapter(fixture());
  const original = editor.serialize();
  const invalid = [
    { type: 'move', viewId: 'view-dto-export', nodeId: 'node-component', x: Infinity, y: 1 },
    { type: 'resize', viewId: 'view-dto-export', nodeId: 'node-component', x: 1, y: 1, width: -1, height: 1 },
    { type: 'reconnect', viewId: 'view-dto-export', connectionId: 'serving-connection',
      sourceId: 'missing', targetId: 'node-service', waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
    { type: 'delete', viewId: 'view-dto-export', itemId: 'missing' }
  ] as EditorCommand[];
  for (const command of invalid) expect(() => editor.execute(command)).toThrow();
  expect(editor.serialize()).toBe(original);
  expect(editor.undo()).toBe(false);
  const snapshot = editor.getModel();
  snapshot.views[0].nodes[0].x = 999;
  const projection = editor.project('view-dto-export');
  projection.nodes[0].x = 999;
  expect(editor.serialize()).toBe(original);
  expect(editor.serialize()).not.toContain('businessObject');
  const privateValue = 'synthetic-private-value';
  expect(() => new DiagramAdapter({ ...fixture(), businessObject: privateValue }))
    .toThrow('This model is not eligible for DTO editing.');
  expect(() => editor.execute({ type: 'connect', viewId: 'view-dto-export', connection: {
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
  let clears = 0;
  const port: CanvasPort = {
    render: (projection) => { renders.push(projection); },
    onCommand: (handler) => { onCommand = handler; return () => { onCommand = undefined; }; },
    onSelection: (handler) => { onSelection = handler; return () => { onSelection = undefined; }; },
    clear: () => { clears++; }
  };
  const events: string[] = [];
  editor.subscribe((event) => { events.push(`${event.type}:${event.viewId}`); event.model.id = 'modified'; });
  const detach = editor.attach('view-dto-export', port);
  onSelection?.(['node-component']);
  onCommand?.({ type: 'label', viewId: 'view-dto-export', itemId: 'node-component', label: 'New label' });
  expect(() => onCommand?.({ type: 'connect', viewId: 'view-two', connection: {
    id: 'line-two', kind: 'line', waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
  } })).toThrow();
  editor.execute({ type: 'connect', viewId: 'view-two', connection: {
    id: 'line-two', kind: 'line', waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
  } });
  expect(events).toEqual(['selection:view-dto-export', 'changed:view-dto-export', 'changed:view-two']);
  editor.undo();
  expect(events.at(-1)).toBe('changed:view-two');
  expect(editor.getModel().id).toBe('model-dto-export');
  expect(renders.every((value) => value.viewId === 'view-dto-export')).toBe(true);
  detach();
  expect(clears).toBe(1);
  const detachSecondView = editor.attach('view-two', port);
  expect(renders.at(-1)?.viewId).toBe('view-two');
  detachSecondView();
  expect(clears).toBe(2);
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

  const unsupported = fixture();
  unsupported.views[0].nodes[0].kind = 'container';
  expect(() => new DiagramAdapter(unsupported)).toThrow('This model is not eligible for DTO editing.');
});
