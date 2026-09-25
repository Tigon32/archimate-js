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
    listeners: new Set<(event: unknown) => void>()
  };
});

vi.mock('../../src/diagram-js-adapter/index.js', () => {
  class FakeSession {
    eligible = state.eligible;
    reasons = state.reasons;
    closed = 0;
    editor = !state.eligible ? undefined : state.editorOverride || {
      getModel: () => structuredClone(state.model),
      subscribe: (listener: (event: unknown) => void) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      execute: (command: unknown) => {
        state.commands.push(command);
        state.listeners.forEach((listener) => listener({
        type: 'changed', viewId: 'view-one', selectedIds: ['node-one'], model: state.model
        }));
      },
      undo: () => true,
      redo: () => true,
      select: (_viewId: string, ids: string[]) => state.listeners.forEach((listener) => listener({
        type: 'selection', viewId: 'view-one', selectedIds: ids, model: state.model
      })),
      project: () => ({ viewId: 'view-one', nodes: [], connections: [], selectedIds: ['node-one'] })
    };
    static async open(_modeler: unknown, xml: string) {
      state.opened.push(xml);
      const session = new FakeSession();
      state.sessions.push(session);
      if (state.deferOpen) {
        await new Promise<void>((resolve) => state.pendingOpens.push({ session, resolve }));
      }
      return session;
    }
    save() { return { xml: '<model/>', dtoJson: '{"schemaVersion":1}' }; }
    close() { this.closed += 1; }
  }
  return {
    DiagramJsCanvasPort: class {},
    DtoModelerSession: FakeSession,
    createDiagramJsModeler: () => {
      state.createdModeler = { destroy: () => { state.destroyed += 1; },
        get: (name: string) => { state.engineGets.push(name); return { name }; } };
      return state.createdModeler;
    },
    createDiagramJsCapabilities: (modeler: { get(serviceName: string): unknown }) => ({
      engine: 'diagram-js', stability: 'unstable', get: (name: string) => modeler.get(name)
    }),
    fitDiagramJsView: vi.fn(),
    zoomDiagramJsCanvas: vi.fn((_modeler: unknown, level: number | 'fit') => level === 'fit' ? undefined : level)
  };
});

beforeEach(() => {
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

it('rejects unsupported layout and ineligible or missing sessions without an edit', async () => {
  const { default: Modeler } = await import('../../src/modeler/index.js');
  const modeler = new Modeler({ container: {} as Element });
  await expect(modeler.optimizeDiagram()).rejects.toMatchObject({
    code: 'MODELER_SESSION_INELIGIBLE'
  });
  state.editorOverride = new DiagramAdapter(importMeffToModelDto(syntheticXml));
  await modeler.open(syntheticXml, { viewId: 'view-dto-export' });
  const before = state.editorOverride.getModel();
  await expect(modeler.optimizeDiagram({ strategy: 'elk-layered' })).rejects.toMatchObject({
    code: 'UNSUPPORTED_STRATEGY', message: 'UNSUPPORTED_STRATEGY'
  });
  expect(state.editorOverride.getModel()).toEqual(before);
  expect(state.editorOverride.undo()).toBe(false);
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
  expect(modeler.save()).toEqual({ xml: '<model/>', dtoJson: '{"schemaVersion":1}' });
  expect(events).toEqual(['opened:view-one', 'changed:node-one', 'selection:node-one']);
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
