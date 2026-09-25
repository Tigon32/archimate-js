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
    createdModeler: undefined as undefined | { destroy(): void; get(serviceName: string): unknown },
    eligible: true,
    reasons: [] as Array<{ code: string; message: string }>,
    listeners: new Set<(event: unknown) => void>()
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
    fitDiagramJsView: vi.fn(),
    zoomDiagramJsCanvas: vi.fn((_modeler: unknown, level: number | 'fit') => level === 'fit' ? undefined : level)
  };
});

beforeEach(() => {
  state.destroyed = 0;
  state.opened = [];
  state.sessions = [];
  state.eligible = true;
  state.reasons = [];
  state.listeners.clear();
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
