import { vi } from 'vitest';

interface FacadeMockState {
  model: { schemaVersion: number; id: string; elements: unknown[]; relationships: unknown[];
    diagnostics: unknown[]; views: Array<{ id: string; nodes: unknown[]; connections: unknown[] }> };
  destroyed: number;
  opened: string[];
  sessions: Array<{ closed: number }>;
  pendingOpens: Array<{ session: { closed: number }; resolve(): void }>;
  commands: unknown[];
  editorOverride?: unknown;
  engineGets: string[];
  createdModeler?: { destroy(): void; get(serviceName: string): unknown };
  eligible: boolean;
  deferOpen: boolean;
  reasons: Array<{ code: string; message: string }>;
  listeners: Set<(event: unknown) => void>;
  viewportListeners: Set<(viewport: { x: number; y: number; scale: number }) => void>;
}

class FakeSession {
  static state: FacadeMockState;
  eligible = FakeSession.state.eligible;
  reasons = FakeSession.state.reasons;
  closed = 0;
  editor = this.createEditor();

  private createEditor() {
    const state = FakeSession.state;
    if (!state.eligible) return undefined;
    if (state.editorOverride) return state.editorOverride;
    return {
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
  }

  static async open(_modeler: unknown, xml: string): Promise<FakeSession> {
    const state = FakeSession.state;
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

export function createAdapterMock(state: FacadeMockState) {
  FakeSession.state = state;
  return {
    DiagramJsCanvasPort: class {},
    DtoModelerSession: FakeSession,
    attachConceptPicker: vi.fn(() => () => {}),
    attachRelationshipChooser: vi.fn(() => () => {}),
    createDiagramJsModeler: () => createModeler(state),
    createDiagramJsCapabilities: (modeler: { get(serviceName: string): unknown }) =>
      createCapabilities(modeler),
    createDiagramJsViewport: () => createViewport(state),
    fitDiagramJsView: vi.fn(),
    zoomDiagramJsCanvas: vi.fn((_modeler: unknown, level: number | 'fit') =>
      level === 'fit' ? undefined : level)
  };
}

function createModeler(state: FacadeMockState): { destroy(): void; get(serviceName: string): unknown } {
  const modeler = {
    destroy: () => { state.destroyed += 1; },
    get: (name: string) => { state.engineGets.push(name); return { name }; }
  };
  state.createdModeler = modeler;
  return modeler;
}

function createCapabilities(modeler: { get(serviceName: string): unknown }) {
  return {
    engine: 'diagram-js',
    stability: 'unstable',
    get: (name: string) => modeler.get(name)
  };
}

function createViewport(state: FacadeMockState) {
  return {
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
  };
}
