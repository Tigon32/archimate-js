import LegacyModeler from '../../lib/Modeler';

export interface DiagramJsModelerInstance {
  importXML(xml: string, viewId?: string): Promise<unknown>;
  getModel(): unknown;
  get(service: string): unknown;
  destroy?(): void;
}

export interface DiagramJsViewport {
  fitView(): void;
  zoom(level: number | 'fit'): number | undefined;
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

function canvasOf(modeler: DiagramJsModelerInstance): CanvasService {
  const canvas = modeler.get('canvas');
  if (!canvas || typeof canvas !== 'object' || typeof (canvas as CanvasService).zoom !== 'function') {
    throw new Error('MODELER_ENGINE_CAPABILITY_UNAVAILABLE');
  }
  return canvas as CanvasService;
}

export function createDiagramJsModeler(options: unknown): DiagramJsModelerInstance {
  return new (LegacyModeler as unknown as new (options: unknown) => DiagramJsModelerInstance)(options);
}

export function fitDiagramJsView(modeler: DiagramJsModelerInstance): void {
  const canvas = canvasOf(modeler);
  canvas.resized?.();
  canvas.zoom('fit-viewport');
}

export function zoomDiagramJsCanvas(modeler: DiagramJsModelerInstance, level: number | 'fit'): number | undefined {
  if (level === 'fit') {
    fitDiagramJsView(modeler);
    return undefined;
  }
  return canvasOf(modeler).zoom(level);
}

export function createDiagramJsCapabilities(modeler: DiagramJsModelerInstance): DiagramJsCapabilities {
  return {
    engine: 'diagram-js',
    stability: 'unstable',
    get: (serviceName: string) => modeler.get(serviceName)
  };
}
