// SYNTHETIC: Facade tests use service/editor doubles and no model payloads.
import { beforeEach, expect, it, vi } from 'vitest';
// @ts-expect-error Node types are excluded from the browser source project.
import { readFileSync } from 'node:fs';
import { DiagramAdapter } from '../../src/model-dto/editor.js';
import { importMeffToModelDto } from '../../src/model-dto/index.js';

// SYNTHETIC: The checked-in MEFF fixture contains only hand-authored test data.
const syntheticXml = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');

const state = vi.hoisted(() => {
  const model = { schemaVersion: 1, id: 'synthetic', elements: [], relationships: [],
    diagnostics: [], views: [{ id: 'view-one', nodes: [], connections: [] }] };
  return {
    model,
    destroyed: 0,
    opened: [] as string[],
    sessions: [] as Array<{ closed: number }>,
    pendingOpens: [] as Array<{ session: { closed: number }; resolve(): void }>,
    commands: [] as unknown[],
    editorOverride: undefined as DiagramAdapter | undefined,
    engineGets: [] as string[],
    createdModeler: undefined as undefined | { destroy(): void; get(serviceName: string): unknown },
    eligible: true,
    deferOpen: false,
    reasons: [] as Array<{ code: string; message: string }>,
    listeners: new Set<(event: unknown) => void>(),
    viewportListeners: new Set<(viewport: { x: number; y: number; scale: number }) => void>()
  };
});

vi.mock('../../src/diagram-js-adapter/index.js', async () => {
  const { createAdapterMock } = await import('./helpers/modeler-facade-adapter-mock.mts');
  return createAdapterMock(state);
});

function resetState(): void {
  state.destroyed = 0;
  state.opened = [];
  state.sessions = [];
  state.pendingOpens = [];
  state.commands = [];
  state.editorOverride = undefined;
  state.engineGets = [];
  state.eligible = true;
  state.deferOpen = false;
  state.reasons = [];
  state.listeners.clear();
  state.viewportListeners.clear();
}

beforeEach(() => {
  resetState();
});

it('optimizes authoritative DTO geometry in one edit without engine services, and reverses it', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  const editor = new DiagramAdapter(importMeffToModelDto(syntheticXml));
  state.editorOverride = editor;
  const modeler = new Modeler({ container: {} as Element });
  await modeler.open(syntheticXml, { viewId: 'view-dto-export' });
  const before = editor.getModel();
  const result = await modeler.optimizeDiagram();
  const after = editor.getModel();
  expect(result.metrics.movedNodeCount).toBe(result.patch.nodes.length);
  expect(result.patch.nodes.length).toBeGreaterThan(0);
  expect(after).not.toEqual(before);
  expect(after.elements).toEqual(before.elements);
  expect(after.relationships).toEqual(before.relationships);
  expect(after.views[0].nodes[0].style).toEqual(before.views[0].nodes[0].style);
  expect(importMeffToModelDto(editor.exportMeff())).toEqual(after);
  expect(state.engineGets).toEqual([]);
  expect(modeler.undo()).toBe(true);
  expect(editor.getModel()).toEqual(before);
  expect(modeler.redo()).toBe(true);
  expect(editor.getModel()).toEqual(after);
  expect(() => modeler.applyLayoutPatch(result.patch, 'after')).toThrow(
    expect.objectContaining({ code: 'DTO_LAYOUT_PATCH_STALE' }));
  expect(editor.getModel()).toEqual(after);
  modeler.applyLayoutPatch(result.patch, 'before');
  expect(editor.getModel()).toEqual(before);
  expect(modeler.undo()).toBe(true);
  expect(editor.getModel()).toEqual(after);
  modeler.destroy();
});

it('discards pending optimization when its session closes', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  const editor = new DiagramAdapter(importMeffToModelDto(syntheticXml));
  state.editorOverride = editor;
  const modeler = new Modeler({ container: {} as Element });
  await modeler.open(syntheticXml, { viewId: 'view-dto-export' });
  const original = editor.getModel();
  const pending = modeler.optimizeDiagram();
  modeler.close();
  await expect(pending).rejects.toMatchObject({ code: 'MODELER_OPEN_SUPERSEDED' });
  expect(editor.getModel()).toEqual(original);
  modeler.destroy();
});

it('commits layered layout and rejects ineligible or missing sessions', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  const modeler = new Modeler({ container: {} as Element });
  await expect(modeler.optimizeDiagram()).rejects.toMatchObject({
    code: 'MODELER_SESSION_INELIGIBLE'
  });
  const model = importMeffToModelDto(syntheticXml);
  for (const connection of model.views[0].connections) delete connection.label;
  for (const relationship of model.relationships) delete relationship.name;
  state.editorOverride = new DiagramAdapter(model);
  await modeler.open(syntheticXml, { viewId: 'view-dto-export' });
  const before = state.editorOverride.getModel();
  const result = await modeler.optimizeDiagram({ strategy: 'elk-layered' });
  const after = state.editorOverride.getModel();
  expect(result.patch.nodes.length).toBeGreaterThan(0);
  expect(after).not.toEqual(before);
  expect(after.relationships).toEqual(before.relationships);
  expect(modeler.undo()).toBe(true);
  expect(state.editorOverride.getModel()).toEqual(before);
  expect(modeler.redo()).toBe(true);
  expect(state.editorOverride.getModel()).toEqual(after);
  modeler.close();
  await expect(modeler.optimizeDiagram()).rejects.toMatchObject({
    code: 'MODELER_SESSION_INELIGIBLE'
  });
  state.eligible = false;
  await modeler.open('<unsupported/>');
  await expect(modeler.optimizeDiagram()).rejects.toMatchObject({
    code: 'MODELER_SESSION_INELIGIBLE'
  });
  modeler.destroy();
});

it('delegates apply-layout-patch commands through the facade undo boundary', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  const modeler = new Modeler({ container: {} as Element });
  await modeler.open('<synthetic/>', { viewId: 'view-one' });
  const patch = { viewId: 'view-one', nodes: [{ id: 'node-one',
    before: { x: 0, y: 0, width: 100, height: 60 },
    after: { x: 40, y: 20, width: 100, height: 60 } }], connections: [] };
  modeler.execute({ type: 'apply-layout-patch', viewId: 'view-one', patch, side: 'after' });
  expect(modeler.undo()).toBe(true);
  expect(state.commands).toEqual([{ type: 'apply-layout-patch', viewId: 'view-one', patch, side: 'after' }]);
});

it('exports and replays deterministic logs through the public facade', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  const base = importMeffToModelDto(syntheticXml);
  const source = new DiagramAdapter(base);
  source.execute({ type: 'move', viewId: 'view-dto-export', nodeId: 'node-component', x: 50, y: 60 });
  const operationJson = source.serializeOperationLog('stable-client');
  const target = new DiagramAdapter(base);
  state.editorOverride = target;
  const modeler = new Modeler({ container: {} as Element });
  await modeler.open(syntheticXml, { viewId: 'view-dto-export' });

  expect(modeler.exportOperationLog('stable-client')).toEqual(target.exportOperationLog('stable-client'));
  modeler.replayOperationLog(operationJson);
  expect(modeler.serializeOperationLog('stable-client')).toBe(operationJson);
  expect(target.getModel()).toEqual(source.getModel());
  modeler.destroy();
});

it('opens, delegates editor operations, emits plain events, and saves', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  const modeler = new Modeler({ container: {} as Element });
  const events: string[] = [];
  modeler.on('opened', (event) => events.push(`${event.type}:${event.viewId}`));
  modeler.on('changed', (event) => events.push(`${event.type}:${event.selectedIds.join(',')}`));
  modeler.on('selection', (event) => events.push(`${event.type}:${event.selectedIds.join(',')}`));
  await expect(modeler.open('<synthetic/>')).resolves.toMatchObject({ eligible: true, viewId: 'view-one' });
  modeler.execute({ type: 'move', viewId: 'view-one', nodeId: 'node-one', x: 1, y: 2 });
  modeler.select(['node-one']);
  expect(modeler.undo()).toBe(true);
  expect(modeler.redo()).toBe(true);
  expect(modeler.getSelection()).toEqual(['node-one']);
  expect(modeler.zoom(0.75)).toBe(0.75);
  expect(modeler.zoom('fit')).toBeUndefined();
  expect(modeler.getZoom()).toBe(1);
  expect(() => modeler.fitSelection()).not.toThrow();
  expect(() => modeler.panBy(10, 20)).not.toThrow();
  expect(modeler.save()).toEqual({ xml: '<model/>', dtoJson: '{"schemaVersion":1}' });
  modeler.on('viewport', (event) => events.push(`${event.type}:${event.x}:${event.y}:${event.scale}`));
  state.viewportListeners.forEach((listener) => listener({ x: 4, y: 5, scale: 0.75 }));
  expect(events).toEqual([
    'opened:view-one',
    'changed:node-one',
    'selection:node-one',
    'viewport:4:5:0.75'
  ]);
});

it('closes previous sessions on reopen and destroys idempotently', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  const modeler = new Modeler({ container: {} as Element });
  const events: string[] = [];
  modeler.on('closed', (event) => events.push(event.type));
  await modeler.open('<one/>');
  await modeler.open('<two/>');
  expect(state.sessions[1].closed).toBe(0);
  expect(state.sessions[0].closed).toBe(1);
  modeler.destroy();
  modeler.destroy();
  expect(state.destroyed).toBe(1);
  expect(events).toEqual(['closed', 'closed']);
  await expect(modeler.open('<three/>')).rejects.toMatchObject({ code: 'MODELER_DESTROYED' });
});

it('surfaces ineligible saves and unstable diagram-js capabilities', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  state.eligible = false;
  state.reasons = [{ code: 'DTO_UNSUPPORTED_FIELDS', message: 'Synthetic unsupported fields.' }];
  const modeler = new Modeler({ container: {} as Element });
  await expect(modeler.open('<unsupported/>')).resolves.toMatchObject({ eligible: false });
  expect(() => modeler.save()).toThrow(expect.objectContaining({ code: 'MODELER_SESSION_INELIGIBLE' }));
  expect(modeler.getEngineCapabilities('diagram-js')).toMatchObject({
    engine: 'diagram-js', stability: 'unstable'
  });
  state.eligible = true;
  state.reasons = [];
});

it('rejects and closes an older open that resolves after a newer open', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  state.deferOpen = true;
  const modeler = new Modeler({ container: {} as Element });
  const older = modeler.open('<older/>');
  const newer = modeler.open('<newer/>');
  const [olderPending, newerPending] = state.pendingOpens;
  newerPending.resolve();
  await expect(newer).resolves.toMatchObject({ eligible: true, viewId: 'view-one' });
  expect(state.listeners.size).toBe(1);
  olderPending.resolve();
  await expect(older).rejects.toMatchObject({ code: 'MODELER_OPEN_SUPERSEDED' });
  expect(state.sessions[0].closed).toBe(1);
  expect(state.sessions[1].closed).toBe(0);
  expect(state.listeners.size).toBe(1);
});

it('rejects and closes an open that finishes after destroy', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  state.deferOpen = true;
  const modeler = new Modeler({ container: {} as Element });
  const opening = modeler.open('<destroyed/>');
  state.pendingOpens[0].resolve();
  modeler.destroy();
  await expect(opening).rejects.toMatchObject({ code: 'MODELER_DESTROYED' });
  expect(state.sessions[0].closed).toBe(1);
  expect(state.listeners.size).toBe(0);
  expect(state.destroyed).toBe(1);
});
