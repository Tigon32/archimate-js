// SYNTHETIC: Facade tests use service/editor doubles and no model payloads.
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const model = { schemaVersion: 1, id: 'synthetic', elements: [], relationships: [],
    diagnostics: [], views: [{ id: 'view-one', nodes: [], connections: [] }] };
  return {
    model,
    destroyed: 0,
    opened: [] as string[],
    sessions: [] as Array<{ closed: number }>,
    pendingOpens: [] as Array<{ session: { closed: number }; resolve(): void }>,
    createdModeler: undefined as undefined | { destroy(): void; get(serviceName: string): unknown },
    eligible: true,
    deferOpen: false,
    reasons: [] as Array<{ code: string; message: string }>,
    listeners: new Set<(event: unknown) => void>(),
    viewportListeners: new Set<(viewport: { x: number; y: number; scale: number }) => void>()
  };
});

vi.mock('../../src/diagram-js-adapter/index.js', () => {
  class FakeSession {
    eligible = state.eligible;
    reasons = state.reasons;
    closed = 0;
    editor = state.eligible ? {
      getModel: () => structuredClone(state.model),
      subscribe: (listener: (event: unknown) => void) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      execute: () => state.listeners.forEach((listener) => listener({
        type: 'changed', viewId: 'view-one', selectedIds: ['node-one'], model: state.model
      })),
      undo: () => true,
      redo: () => true,
      select: (_viewId: string, ids: string[]) => state.listeners.forEach((listener) => listener({
        type: 'selection', viewId: 'view-one', selectedIds: ids, model: state.model
      })),
      project: () => ({ viewId: 'view-one', nodes: [], connections: [], selectedIds: ['node-one'] })
    } : undefined;
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
      state.createdModeler = { destroy: () => { state.destroyed += 1; }, get: (name: string) => ({ name }) };
      return state.createdModeler;
    },
    createDiagramJsCapabilities: (modeler: { get(serviceName: string): unknown }) => ({
      engine: 'diagram-js', stability: 'unstable', get: (name: string) => modeler.get(name)
    }),
    createDiagramJsViewport: () => ({
      fitView: vi.fn(() => ({ x: 0, y: 0, scale: 1 })),
      fitSelection: vi.fn(() => ({ x: 1, y: 2, scale: 0.5 })),
      zoom: vi.fn((level: number | 'fit') => level === 'fit' ?
        ({ x: 0, y: 0, scale: 1 }) : ({ x: 0, y: 0, scale: level })),
      getZoom: vi.fn(() => 1),
      panBy: vi.fn(() => ({ x: 10, y: 20, scale: 1 })),
      getViewport: vi.fn(() => ({ x: 0, y: 0, scale: 1 })),
      onViewport: vi.fn((handler: (viewport: { x: number; y: number; scale: number }) => void) => {
        state.viewportListeners.add(handler);
        return () => state.viewportListeners.delete(handler);
      })
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
  state.eligible = true;
  state.deferOpen = false;
  state.reasons = [];
  state.listeners.clear();
  state.viewportListeners.clear();
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
