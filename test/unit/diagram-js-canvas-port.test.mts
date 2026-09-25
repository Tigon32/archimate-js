// SYNTHETIC: All model data and canvas elements are generated from a checked-in fixture.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import { DiagramJsCanvasPort } from '../../src/diagram-js-adapter/index.js';
import { DiagramAdapter, importMeffToModelDto } from '../../src/model-dto/index.js';
import type { DiagramJsCanvasServices } from '../../src/model-dto/index.js';

function mockModeling() {
  return {
    nativeCalls: 0,
    _archimateRules: { canConnect: (_source: unknown, _target: unknown, connection: unknown) =>
      (connection as { type: string }).type === 'Serving' ? { type: 'Serving' } : false },
    moveElements(_shapes: unknown[], _delta: { x: number; y: number }, _target?: unknown,
      _hints?: { attach?: boolean }) { this.nativeCalls++; },
    resizeShape(_shape: unknown, _bounds: { x: number; y: number; width: number; height: number },
      _minBounds?: unknown, _hints?: unknown) { this.nativeCalls++; },
    updateLabel(_element: unknown, _label: string, _bounds?: unknown, _hints?: unknown) { this.nativeCalls++; },
    createConnection(_source: unknown, _target: unknown, _attrs: unknown) { this.nativeCalls++; },
    reconnect(_connection: unknown, _source: unknown, _target: unknown, _docking: unknown) { this.nativeCalls++; },
    removeElements(_elements: unknown[]) { this.nativeCalls++; },
    removeShape(_shape: unknown) { this.nativeCalls++; },
    removeConnection(_connection: unknown) { this.nativeCalls++; }
  };
}

function setup() {
  const model = importMeffToModelDto(readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8'));
  model.views.push({ id: 'view-two', nodes: [], connections: [] });
  const editor = new DiagramAdapter(model);
  const shapes = new Map<string, Record<string, unknown>>();
  const connections = new Map<string, Record<string, unknown>>();
  const modeling = mockModeling();
  const canvas = {
    root: { id: 'root', children: [] as Array<Record<string, unknown>> },
    getRootElement() { return this.root; },
    addShape(shape: unknown, parent?: unknown) {
      const item = shape as Record<string, unknown>;
      item.parent = parent || this.root;
      const owner = item.parent as { children?: Array<Record<string, unknown>> };
      owner.children ||= [];
      owner.children.push(item);
      shapes.set(String(item.id), item);
      return item;
    },
    addConnection(connection: unknown) {
      const item = connection as Record<string, unknown>;
      connections.set(String(item.id), item);
      this.root.children.push(item);
      return item;
    },
    removeShape(shape: unknown) { shapes.delete(String((shape as { id: string }).id)); },
    removeConnection(connection: unknown) { connections.delete(String((connection as { id: string }).id)); }
  };
  const services: DiagramJsCanvasServices = {
    canvas,
    elementFactory: {
      createShape: (attributes) => ({ ...attributes, children: [] }),
      createConnection: (attributes) => ({ ...attributes })
    },
    eventBus: { on() {}, off() {} },
    selection: { get: () => [], select() {} },
    modeling
  };
  const port = new DiagramJsCanvasPort(services);
  return { editor, port, modeling, shapes, connections };
}

it('routes semantic connect, reconnect and view deletion through one history', () => {
  const { editor, port, modeling, shapes, connections } = setup();
  const original = editor.serialize();
  const detach = editor.attach('view-dto-export', port);
  const source = shapes.get('node-service');
  const target = shapes.get('node-component');
  modeling.createConnection(source, target, { id: 'new-connection', type: 'Serving',
    waypoints: [{ x: 300, y: 70 }, { x: 200, y: 80 }, { x: 150, y: 70 }] });
  const added = editor.getModel();
  const created = added.views[0].connections.find((item) => item.id === 'new-connection')!;
  const relationship = added.relationships.find((item) => item.id === created.relationshipId)!;
  expect(relationship).toMatchObject({ type: 'archimate:Serving',
    sourceId: 'service-two', targetId: 'component-one' });
  expect(created.waypoints.map((point) => point.kind)).toEqual([
    'sourceAttachment', 'bendpoint', 'targetAttachment'
  ]);
  expect(editor.exportMeff()).toContain(`identifier="${relationship.id}"`);
  expect(connections.has('new-connection')).toBe(true);

  modeling.reconnect(connections.get('new-connection'), shapes.get('node-service-nested'),
    shapes.get('node-component'), [{ x: 105, y: 175 }, { x: 230, y: 85 }, { x: 150, y: 75 }]);
  const changed = editor.getModel();
  expect(changed.relationships.find((item) => item.id === relationship.id)).toMatchObject({
    sourceId: 'service-two', targetId: 'component-one'
  });
  expect(changed.views[0].connections.find((item) => item.id === 'new-connection')).toMatchObject({
    sourceId: 'node-service-nested', targetId: 'node-component'
  });
  expect(() => modeling.reconnect(connections.get('new-connection'), shapes.get('node-service'),
    shapes.get('node-service'), { x: Number.NaN, y: 0 })).toThrow();
  expect(editor.getModel()).toEqual(changed);
  modeling.moveElements([shapes.get('node-service')], { x: 5, y: 0 });
  const moved = editor.getModel();
  modeling.removeElements([shapes.get('node-component')]);
  expect(editor.getModel().views[0].connections).toEqual([]);
  expect(editor.getModel().elements).toEqual(added.elements);
  expect(editor.getModel().relationships).toEqual(changed.relationships);
  expect(editor.undo()).toBe(true);
  expect(editor.getModel()).toEqual(moved);
  expect(editor.undo()).toBe(true);
  expect(editor.getModel()).toEqual(changed);
  expect(editor.undo()).toBe(true);
  expect(editor.getModel()).toEqual(added);
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(original);
  expect(modeling.nativeCalls).toBe(0);
  detach();
  const detachOther = editor.attach('view-two', port);
  expect(editor.project('view-two').connections).toEqual([]);
  detachOther();
});

it('rejects semantic endpoint mismatches and shared relationship retargeting atomically', () => {
  const { editor, port, modeling, shapes, connections } = setup();
  const detach = editor.attach('view-dto-export', port);
  const original = editor.serialize();
  expect(() => editor.execute({ type: 'connect', viewId: 'view-dto-export',
    connection: { id: 'wrong-endpoints', kind: 'relationship', relationshipId: 'serving-one-two',
      sourceId: 'node-service', targetId: 'node-component', waypoints: [
        { x: 300, y: 75, kind: 'sourceAttachment' },
        { x: 160, y: 75, kind: 'targetAttachment' }
      ] } })).toThrow();
  expect(editor.serialize()).toBe(original);
  modeling.createConnection(shapes.get('node-component'), shapes.get('node-service'),
    { id: 'shared-connection', type: 'Serving', relationshipRef: {
      id: 'serving-one-two', type: 'Serving'
    } });
  const beforeRetarget = editor.serialize();
  expect(() => modeling.reconnect(connections.get('shared-connection'),
    shapes.get('node-service'), shapes.get('node-component'),
    [{ x: 300, y: 75 }, { x: 160, y: 75 }])).toThrow();
  expect(editor.serialize()).toBe(beforeRetarget);
  expect(connections.get('shared-connection')).toMatchObject({ source: { id: 'node-component' },
    target: { id: 'node-service' } });
  expect(() => modeling.removeElements([shapes.get('node-component'), shapes.get('node-service')]))
    .toThrow();
  expect(editor.serialize()).toBe(beforeRetarget);
  detach();
});

it('preserves finite fractional and negative waypoints in live reconnect commands', () => {
  const { editor, port, modeling, shapes, connections } = setup();
  const detach = editor.attach('view-dto-export', port);
  const original = editor.serialize();
  modeling.reconnect(connections.get('serving-connection'), shapes.get('node-component'),
    shapes.get('node-service'), [{ x: -2.5, y: 70.25 }, { x: 200.5, y: 80 },
      { x: 300, y: 75 }]);
  expect(editor.getModel().views[0].connections[0].waypoints).toEqual([
    { x: -2.5, y: 70.25, kind: 'sourceAttachment' },
    { x: 200.5, y: 80, kind: 'bendpoint' },
    { x: 300, y: 75, kind: 'targetAttachment' }
  ]);
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(original);
  detach();
});

it('routes move, resize, and label intents to one DTO history before native mutation', () => {
  const { editor, port, modeling, shapes } = setup();
  const original = editor.serialize();
  const events: string[] = [];
  editor.subscribe((event) => {
    events.push(event.type);
    expect(JSON.stringify(event)).not.toMatch(/businessObject|\$parent|\$type/);
  });
  const nativeMove = modeling.moveElements;
  const detach = editor.attach('view-dto-export', port);
  expect(modeling.moveElements).not.toBe(nativeMove);

  modeling.moveElements([shapes.get('node-component')], { x: 12, y: -5 });
  modeling.resizeShape(shapes.get('node-service'), { x: 210, y: 30, width: 150, height: 80 });
  modeling.updateLabel(shapes.get('node-component'), 'Updated component');
  const changed = editor.getModel();
  expect(changed.views[0].nodes[0]).toMatchObject({ x: 32, y: 35, label: 'Updated component' });
  expect(changed.views[0].nodes[1]).toMatchObject({ x: 210, y: 30, width: 150, height: 80 });
  expect(shapes.get('node-component')).toMatchObject({ x: 32, y: 35, name: 'Updated component' });
  expect(shapes.get('node-service')).toMatchObject({ x: 210, y: 30, width: 150, height: 80 });
  expect(modeling.nativeCalls).toBe(0);
  expect(events).toEqual(['changed', 'changed', 'changed']);
  expect(() => modeling.moveElements([shapes.get('node-component')], { x: 1, y: 1 },
    shapes.get('node-service'))).toThrow('The model DTO is invalid.');
  expect(editor.getModel()).toEqual(changed);

  expect(editor.undo()).toBe(true);
  expect(editor.undo()).toBe(true);
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(original);
  expect(editor.redo()).toBe(true);
  expect(editor.redo()).toBe(true);
  expect(editor.redo()).toBe(true);
  expect(editor.serialize()).not.toContain('businessObject');
  detach();
  expect(modeling.moveElements).toBe(nativeMove);
  expect(modeling.nativeCalls).toBe(0);
});

it('restores modeling hooks when a view is detached or switched', () => {
  const { editor, port, modeling } = setup();
  const originalMethods = [modeling.moveElements, modeling.resizeShape, modeling.updateLabel];
  const detach = editor.attach('view-dto-export', port);
  detach();
  expect([modeling.moveElements, modeling.resizeShape, modeling.updateLabel]).toEqual(originalMethods);
  const detachOtherView = editor.attach('view-two', port);
  expect([modeling.moveElements, modeling.resizeShape, modeling.updateLabel])
    .not.toEqual(originalMethods);
  detachOtherView();
  expect([modeling.moveElements, modeling.resizeShape, modeling.updateLabel]).toEqual(originalMethods);
});
