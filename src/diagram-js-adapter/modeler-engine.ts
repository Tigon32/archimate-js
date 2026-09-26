import LegacyModeler from '../../lib/Modeler';
import {
  fitSelection,
  fitView,
  onViewportChanged,
  panBy,
  viewportState,
  zoom
} from './viewport.js';
import type { DiagramJsViewportServices, DiagramJsViewportState } from './viewport.js';

export interface DiagramJsModelerInstance {
  importXML(xml: string, viewId?: string): Promise<unknown>;
  getModel(): unknown;
  get(service: string): unknown;
  destroy?(): void;
}

export interface DiagramJsViewport {
  fitView(): DiagramJsViewportState;
  fitSelection(): DiagramJsViewportState;
  zoom(level: number | 'fit'): DiagramJsViewportState;
  getZoom(): number;
  panBy(dx: number, dy: number): DiagramJsViewportState;
  getViewport(): DiagramJsViewportState;
  onViewport(handler: (viewport: DiagramJsViewportState) => void): () => void;
}

export interface DiagramJsCapabilities {
  readonly engine: 'diagram-js';
  readonly stability: 'unstable';
  get(serviceName: string): unknown;
}

type CanvasService = {
  zoom(newScale?: number | 'fit-viewport'): number;
  resized?(): void;
};

function servicesOf(modeler: DiagramJsModelerInstance): DiagramJsViewportServices {
  const canvas = modeler.get('canvas');
  if (!canvas || typeof canvas !== 'object' || typeof (canvas as CanvasService).zoom !== 'function') {
    throw new Error('MODELER_ENGINE_CAPABILITY_UNAVAILABLE');
  }
  return {
    canvas: canvas as DiagramJsViewportServices['canvas'],
    eventBus: modeler.get('eventBus') as DiagramJsViewportServices['eventBus'],
    selection: modeler.get('selection') as DiagramJsViewportServices['selection']
  };
}

export function createDiagramJsModeler(options: unknown): DiagramJsModelerInstance {
  return new (LegacyModeler as unknown as new (options: unknown) => DiagramJsModelerInstance)(options);
}

export function fitDiagramJsView(modeler: DiagramJsModelerInstance): void {
  fitView(servicesOf(modeler));
}

export function zoomDiagramJsCanvas(modeler: DiagramJsModelerInstance, level: number | 'fit'): number | undefined {
  if (level === 'fit') {
    fitDiagramJsView(modeler);
    return undefined;
  }
  return zoom(servicesOf(modeler), level).scale;
}

export function createDiagramJsViewport(modeler: DiagramJsModelerInstance): DiagramJsViewport {
  const services = servicesOf(modeler);
  return {
    fitView: () => fitView(services),
    fitSelection: () => fitSelection(services),
    zoom: (level) => zoom(services, level),
    getZoom: () => viewportState(services.canvas).scale,
    panBy: (dx, dy) => panBy(services, dx, dy),
    getViewport: () => viewportState(services.canvas),
    onViewport: (handler) => onViewportChanged(services, handler)
  };
}

export function createDiagramJsCapabilities(modeler: DiagramJsModelerInstance): DiagramJsCapabilities {
  return {
    engine: 'diagram-js',
    stability: 'unstable',
    get: (serviceName: string) => modeler.get(serviceName)
  };
}
