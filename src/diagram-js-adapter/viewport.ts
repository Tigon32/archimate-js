import { getBBox } from 'diagram-js/lib/util/Elements.js';
import type { Element } from 'diagram-js/lib/model/Types.js';

export interface DiagramJsViewportState {
  x: number;
  y: number;
  scale: number;
}

interface CanvasViewbox extends DiagramJsViewportState {
  width: number;
  height: number;
}

interface CanvasService {
  zoom(newScale?: number | 'fit-viewport'): number;
  viewbox(box?: false | { x: number; y: number; width: number; height: number }): CanvasViewbox;
  scroll(delta: { dx: number; dy: number }): unknown;
  resized?(): void;
}

interface EventBusService {
  on(event: string, listener: (event: unknown) => void): void;
  off(event: string, listener: (event: unknown) => void): void;
}

interface SelectionService {
  get(): unknown[];
}

export interface DiagramJsViewportServices {
  canvas: CanvasService;
  eventBus?: EventBusService;
  selection?: SelectionService;
}

export function viewportState(canvas: CanvasService): DiagramJsViewportState {
  const viewbox = canvas.viewbox(false);
  return { x: viewbox.x, y: viewbox.y, scale: viewbox.scale };
}

export function fitView(services: DiagramJsViewportServices): DiagramJsViewportState {
  services.canvas.resized?.();
  services.canvas.zoom('fit-viewport');
  return viewportState(services.canvas);
}

export function fitSelection(services: DiagramJsViewportServices): DiagramJsViewportState {
  const selected = (services.selection?.get() ?? []).filter(isDiagramElement);
  if (!selected.length) return fitView(services);
  const bounds = paddedBounds(getBBox(selected), 100);
  services.canvas.viewbox(bounds);
  return viewportState(services.canvas);
}

export function zoom(services: DiagramJsViewportServices, level: number | 'fit'): DiagramJsViewportState {
  if (level === 'fit') return fitView(services);
  services.canvas.zoom(level);
  return viewportState(services.canvas);
}

export function panBy(services: DiagramJsViewportServices, dx: number, dy: number): DiagramJsViewportState {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('MODELER_INVALID_VIEWPORT_DELTA');
  services.canvas.scroll({ dx, dy });
  return viewportState(services.canvas);
}

export function onViewportChanged(
  services: DiagramJsViewportServices,
  handler: (viewport: DiagramJsViewportState) => void
): () => void {
  if (!services.eventBus) return () => {};
  const listener = (): void => handler(viewportState(services.canvas));
  services.eventBus.on('canvas.viewbox.changed', listener);
  return () => services.eventBus?.off('canvas.viewbox.changed', listener);
}

function paddedBounds(bounds: { x: number; y: number; width: number; height: number }, padding: number) {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: Math.max(1, bounds.width + padding * 2),
    height: Math.max(1, bounds.height + padding * 2)
  };
}

function isDiagramElement(value: unknown): value is Element {
  return Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string');
}
