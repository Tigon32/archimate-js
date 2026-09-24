// SYNTHETIC: All model data and canvas elements are generated from a checked-in fixture.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import { DiagramAdapter, DiagramJsCanvasPort, importMeffToModelDto } from '../../src/model-dto/index.js';
import type { DiagramJsCanvasServices } from '../../src/model-dto/index.js';

function setup() {
  const model = importMeffToModelDto(readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8'));
  model.views.push({ id: 'view-two', nodes: [], connections: [] });
  const editor = new DiagramAdapter(model);
  const shapes = new Map<string, Record<string, unknown>>();
  const modeling = {
    nativeCalls: 0,
    moveElements(_shapes: unknown[], _delta: { x: number; y: number }, _target?: unknown,
      _hints?: { attach?: boolean }) { this.nativeCalls++; },
    resizeShape(_shape: unknown, _bounds: { x: number; y: number; width: number; height: number },
      _minBounds?: unknown, _hints?: unknown) { this.nativeCalls++; },
    updateLabel(_element: unknown, _label: string, _bounds?: unknown, _hints?: unknown) { this.nativeCalls++; }
  };
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
    addConnection(connection: unknown) { return connection; },
    removeShape(shape: unknown) { shapes.delete(String((shape as { id: string }).id)); },
    removeConnection() {}
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
  return { editor, port, modeling, shapes };
}

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
