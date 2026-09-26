// SYNTHETIC: All model data and canvas elements are generated from a checked-in fixture.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import { DiagramJsCanvasPort } from '../../src/diagram-js-adapter/index.js';
import type { QuickCreateRequester, RelationshipTypeRequester } from '../../src/diagram-js-adapter/index.js';
import { DiagramAdapter, importMeffToModelDto } from '../../src/model-dto/index.js';
import type {
  DiagramJsCanvasServices,
  EditorCommand,
  RelationshipEditDiagnostic
} from '../../src/model-dto/index.js';

function mockModeling(rejectLegacyRules = false) {
  return {
    nativeCalls: 0,
    _archimateRules: {
      calls: 0,
      canConnect(_source: unknown, _target: unknown, connection: unknown) {
        this.calls++;
        return !rejectLegacyRules && (connection as { type: string }).type === 'Serving' ?
          { type: 'Serving' } : false;
      }
    },
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

function mockEventBus() {
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  return {
    on(event: string, priorityOrHandler: number | ((event: unknown) => void),
      listener?: (event: unknown) => void) {
      const handler = typeof priorityOrHandler === 'function' ? priorityOrHandler : listener!;
      const listeners = handlers.get(event) ?? new Set();
      listeners.add(handler);
      handlers.set(event, listeners);
    },
    off(event: string, handler: (event: unknown) => void) {
      handlers.get(event)?.delete(handler);
    },
    fire(event: string, value: unknown = {}) {
      return [...(handlers.get(event) || [])].map((handler) => handler(value));
    }
  };
}

function updateRelationshipPair(model: ReturnType<typeof importMeffToModelDto>,
  pair: readonly [string, string]): void {
  model.elements.find((item) => item.id === 'component-one')!.type = `archimate:${pair[0]}`;
  model.elements.find((item) => item.id === 'service-two')!.type = `archimate:${pair[1]}`;
}

function setup(supportedServing = false, rejectLegacyRules = false,
  requestRelationshipType?: RelationshipTypeRequester,
  relationshipPair?: readonly [string, string],
  requestQuickCreate?: QuickCreateRequester) {
  const model = importMeffToModelDto(readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8'));
  if (supportedServing) {
    model.elements.find((item) => item.id === 'component-one')!.type = 'archimate:ApplicationService';
    model.elements.find((item) => item.id === 'service-two')!.type = 'archimate:ApplicationComponent';
  }
  if (relationshipPair) updateRelationshipPair(model, relationshipPair);
  model.views.push({ id: 'view-two', nodes: [], connections: [] });
  const editor = new DiagramAdapter(model);
  const shapes = new Map<string, Record<string, unknown>>();
  const connections = new Map<string, Record<string, unknown>>();
  const modeling = mockModeling(rejectLegacyRules);
  const eventBus = mockEventBus();
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
    eventBus,
    selection: { get: () => [], select() {} },
    modeling
  };
  const port = new DiagramJsCanvasPort(services, requestRelationshipType, requestQuickCreate);
  return { editor, port, modeling, shapes, connections, eventBus };
}

function diagnosticOf(action: () => unknown): RelationshipEditDiagnostic | undefined {
  try { action(); }
  catch (error) {
    return (error as { diagnostic?: RelationshipEditDiagnostic }).diagnostic;
  }
  return undefined;
}

it('routes semantic connect, reconnect and view deletion through one history', () => {
  const { editor, port, modeling, shapes, connections } = setup();
  const original = editor.serialize();
  const detach = editor.attach('view-dto-export', port);
  const source = shapes.get('node-service'), target = shapes.get('node-component');
  expect(modeling.createConnection(source, target, { id: 'new-connection', type: 'Serving',
    waypoints: [{ x: 300, y: 70 }, { x: 200, y: 80 }, { x: 150, y: 70 }] }))
    .toMatchObject({ id: 'new-connection' });
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

it('defers generic live relationship creation until the domain chooser selects a permitted type', () => {
  const requests: Array<{ sourceType: string; targetType: string; choose(type: string): void }> = [];
  const { editor, port, modeling, shapes } = setup(false, false,
    (request) => requests.push(request), ['ApplicationProcess', 'ApplicationProcess']);
  const detach = editor.attach('view-dto-export', port);
  const before = editor.serialize();
  modeling.createConnection(shapes.get('node-component'), shapes.get('node-service'), {
    id: 'relationship-choice-connection',
    type: 'Relationship',
    waypoints: [{ x: 160, y: 75 }, { x: 300, y: 75 }]
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    sourceType: 'ApplicationProcess',
    targetType: 'ApplicationProcess'
  });
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);

  requests[0].choose('Flow');
  const committed = editor.getModel();
  const connection = committed.views[0].connections.find((item) =>
    item.id === 'relationship-choice-connection')!;
  expect(committed.relationships.find((item) => item.id === connection.relationshipId)).toMatchObject({
    type: 'archimate:Flow', sourceId: 'component-one', targetId: 'service-two'
  });
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(before);
  detach();
});

it('does not create a generic relationship when the chooser is canceled', () => {
  const requests: Array<{ sourceType: string; targetType: string; choose(type: string): void }> = [];
  const { editor, port, modeling, shapes } = setup(false, false,
    (request) => requests.push(request), ['ApplicationProcess', 'ApplicationProcess']);
  const detach = editor.attach('view-dto-export', port);
  const before = editor.serialize();
  modeling.createConnection(shapes.get('node-component'), shapes.get('node-service'), {
    id: 'canceled-relationship-choice',
    type: 'Relationship'
  });
  expect(requests).toHaveLength(1);
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);
  detach();
});

it('routes an empty-canvas connector drop to quick-create without mutating state first', () => {
  const requests: Array<{
    sourceNodeId: string; sourceElementId: string; sourceType: string;
    position: { x: number; y: number }; execute(command: EditorCommand): void
  }> = [];
  const { editor, port, shapes, eventBus } = setup(false, false, undefined, undefined,
    (request) => requests.push(request));
  const detach = editor.attach('view-dto-export', port);
  const before = editor.serialize();
  const results = eventBus.fire('connect.ended', {
    context: { start: shapes.get('node-component'), hover: null, target: null, canExecute: false },
    x: 500, y: 240
  });
  expect(results).toContain(false);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    sourceNodeId: 'node-component',
    sourceElementId: 'component-one',
    sourceType: 'ApplicationComponent',
    position: { x: 500, y: 240 }
  });
  expect(editor.serialize()).toBe(before);
  expect(editor.undo()).toBe(false);
  detach();
});

it('commits picker direct edits to the semantic name and clears canceled intent', () => {
  const { editor, port, modeling, shapes, eventBus } = setup();
  const detach = editor.attach('view-dto-export', port);
  const originalName = editor.getModel().elements.find((item) => item.id === 'component-one')!.name;
  port.beginSemanticNameEdit('node-component');
  modeling.updateLabel(shapes.get('node-component'), 'Picker Created Service');
  const renamed = editor.getModel();
  expect(renamed.elements.find((item) => item.id === 'component-one')?.name)
    .toBe('Picker Created Service');
  expect(renamed.views[0].nodes[0].label).toBeUndefined();
  expect(editor.undo()).toBe(true);
  expect(editor.getModel().elements.find((item) => item.id === 'component-one')?.name).toBe(originalName);

  port.beginSemanticNameEdit('node-component');
  eventBus.fire('directEditing.cancel');
  modeling.updateLabel(shapes.get('node-component'), 'View-only label');
  const viewEdited = editor.getModel();
  expect(viewEdited.elements.find((item) => item.id === 'component-one')?.name).toBe(originalName);
  expect(viewEdited.views[0].nodes[0].label).toBe('View-only label');
  detach();
});

it('rejects semantic endpoint mismatches and shared relationship retargeting atomically', () => {
  const { editor, port, modeling, shapes, connections } = setup(true);
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
  modeling.removeElements([shapes.get('node-component'), connections.get('shared-connection')]);
  expect(editor.getModel().views[0].nodes.some((item) => item.id === 'node-component')).toBe(false);
  expect(editor.undo()).toBe(true);
  expect(editor.serialize()).toBe(beforeRetarget);
  detach();
});

it('returns the DTO semantic diagnostic for live connects rejected by legacy rules', () => {
  const { editor, port, modeling, shapes, connections } = setup(false, true);
  const detach = editor.attach('view-dto-export', port);
  const original = editor.serialize();
  const diagnostic = diagnosticOf(() => modeling.createConnection(shapes.get('node-component'),
    shapes.get('node-service'), { id: 'unsupported-live-connection', type: 'Serving' }));
  expect(diagnostic).toMatchObject({ code: 'DTO_RELATIONSHIP_UNSUPPORTED',
    category: 'unsupported-profile', operation: 'connect',
    connectionId: 'unsupported-live-connection' });
  expect(modeling._archimateRules.calls).toBe(0);
  expect(editor.serialize()).toBe(original);
  expect(editor.undo()).toBe(false);
  expect(connections.has('unsupported-live-connection')).toBe(false);
  detach();
});

it('returns the DTO semantic diagnostic for live reconnects rejected by legacy rules', () => {
  const { editor, port, modeling, shapes, connections } = setup(true, true);
  const detach = editor.attach('view-dto-export', port);
  const original = editor.serialize();
  const connection = connections.get('serving-connection');
  const diagnostic = diagnosticOf(() => modeling.reconnect(connection, shapes.get('node-service'),
    shapes.get('node-component'), [{ x: 300, y: 75 }, { x: 160, y: 75 }]));
  expect(diagnostic).toMatchObject({ code: 'DTO_RELATIONSHIP_UNSUPPORTED',
    category: 'unsupported-profile', operation: 'reconnect',
    connectionId: 'serving-connection', relationshipId: 'serving-one-two' });
  expect(modeling._archimateRules.calls).toBe(0);
  expect(editor.serialize()).toBe(original);
  expect(editor.undo()).toBe(false);
  expect(connections.get('serving-connection')).toMatchObject({
    source: { id: 'node-component' }, target: { id: 'node-service' }
  });
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

it('routes multi-node move and multi-item deletion as batch DTO commands', () => {
  const { editor, port, modeling, shapes, connections } = setup();
  const detach = editor.attach('view-dto-export', port);
  const original = editor.getModel();
  modeling.moveElements([shapes.get('node-component'), shapes.get('node-service')], { x: 8, y: 12 });
  expect(editor.getModel().views[0].nodes[0]).toMatchObject({ x: 28, y: 52 });
  expect(editor.getModel().views[0].nodes[1]).toMatchObject({ x: 308, y: 52 });
  expect(editor.undo()).toBe(true);
  expect(editor.getModel()).toEqual(original);

  modeling.removeElements([shapes.get('node-component'), connections.get('serving-connection')]);
  expect(editor.getModel().views[0].nodes.some((item) => item.id === 'node-component')).toBe(false);
  expect(editor.getModel().views[0].connections).toEqual([]);
  expect(editor.getModel().elements).toEqual(original.elements);
  expect(editor.getModel().relationships).toEqual(original.relationships);
  expect(editor.undo()).toBe(true);
  expect(editor.getModel()).toEqual(original);
  expect(modeling.nativeCalls).toBe(0);
  detach();
});

it('routes mixed top-level and nested batch moves without reparenting', () => {
  const { editor, port, modeling, shapes } = setup();
  const detach = editor.attach('view-dto-export', port);
  const original = editor.getModel();
  expect(() => modeling.moveElements([shapes.get('node-service'), shapes.get('node-service-nested')],
    { x: 4, y: 5 }, shapes.get('node-component'))).toThrow('The model DTO is invalid.');
  expect(editor.getModel()).toEqual(original);
  expect(editor.undo()).toBe(false);
  modeling.moveElements([shapes.get('node-service'), shapes.get('node-service-nested')], { x: 4, y: 5 });
  const view = editor.getModel().views[0];
  expect(view.nodes[1]).toMatchObject({ id: 'node-service', x: 304, y: 45 });
  expect(view.nodes[0].nodes[0]).toMatchObject({ id: 'node-service-nested', x: 14, y: 125 });
  expect(editor.undo()).toBe(true);
  expect(editor.getModel()).toEqual(original);
  expect(modeling.nativeCalls).toBe(0);
  detach();
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
