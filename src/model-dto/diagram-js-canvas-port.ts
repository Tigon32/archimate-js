import type { CanvasPort, CanvasProjection, EditorCommand } from './editor.js';
import type { StyleDto } from './types.js';

interface CanvasElement {
  id?: string;
}

interface DiagramJsCanvas {
  clear(): void;
  addShape(shape: unknown, parent?: unknown): unknown;
  addConnection(connection: unknown): unknown;
}

interface DiagramJsElementFactory {
  createShape(attributes: Record<string, unknown>): unknown;
  createConnection(attributes: Record<string, unknown>): unknown;
}

interface DiagramJsEventBus {
  on(event: string, listener: (event: unknown) => void): void;
  off(event: string, listener: (event: unknown) => void): void;
}

interface DiagramJsSelection {
  get(): unknown[];
  select(elements: unknown[]): void;
}

/** Minimal service surface accepted from a live Viewer or Modeler instance. */
export interface DiagramJsCanvasServices {
  canvas: DiagramJsCanvas;
  elementFactory: DiagramJsElementFactory;
  eventBus: DiagramJsEventBus;
  selection: DiagramJsSelection;
}

type ProjectionNode = CanvasProjection['nodes'][number];
type ProjectionConnection = CanvasProjection['connections'][number];

function diagramType(type: string | undefined, fallback: string): string {
  return type?.replace(/^archimate:/, '') || fallback;
}

function rendererStyle(style: StyleDto | undefined): Record<string, unknown> {
  return {
    fillColor: style?.fill,
    lineColor: style?.stroke,
    lineWidth: style?.lineWidth ?? 1,
    textAlignment: 'center',
    textPosition: 'middle',
    fontStyle: 'normal'
  };
}

function modelStyle(style: StyleDto | undefined): Record<string, unknown> | undefined {
  if (!style) return undefined;
  return { fillColor: style.fill, lineColor: style.stroke, lineWidth: style.lineWidth };
}

function isElement(value: unknown): value is CanvasElement {
  return Boolean(value && typeof value === 'object' && typeof (value as CanvasElement).id === 'string');
}

/**
 * Disposable diagram-js rendering for a single DTO view. Canvas objects and
 * renderer-only businessObject facades stay private to this port.
 */
export class DiagramJsCanvasPort implements CanvasPort {
  private readonly shapes = new Map<string, unknown>();
  private readonly connections = new Map<string, unknown>();
  private readonly selectionHandlers = new Set<(ids: string[]) => void>();
  private rendering = false;
  private listening = false;
  private readonly onSelectionChanged = (event: unknown): void => {
    if (this.rendering) return;
    const selected = event && typeof event === 'object' &&
      Array.isArray((event as { newSelection?: unknown }).newSelection) ?
      (event as { newSelection: unknown[] }).newSelection : this.services.selection.get();
    const ids = selected.filter(isElement).map((element) => element.id!)
      .filter((id) => this.shapes.has(id) || this.connections.has(id));
    for (const handler of this.selectionHandlers) handler(ids);
  };

  constructor(private readonly services: DiagramJsCanvasServices) {}

  render(projection: CanvasProjection): void {
    this.rendering = true;
    try {
      this.clear();
      const nodes = new Map(projection.nodes.map((node) => [node.id, node]));
      for (const node of projection.nodes) this.renderNode(node, nodes);
      for (const connection of projection.connections) this.renderConnection(connection);
      const selected = projection.selectedIds.map((id) => this.shapes.get(id) || this.connections.get(id))
        .filter((element) => element !== undefined);
      if (selected.length) this.services.selection.select(selected);
    } finally {
      this.rendering = false;
    }
  }

  onCommand(handler: (command: EditorCommand) => void): () => void {
    // Gesture translation is intentionally enabled by the command-integration issue.
    void handler;
    return () => {};
  }

  onSelection(handler: (ids: string[]) => void): () => void {
    this.selectionHandlers.add(handler);
    if (!this.listening) {
      this.services.eventBus.on('selection.changed', this.onSelectionChanged);
      this.listening = true;
    }
    return () => {
      this.selectionHandlers.delete(handler);
      if (!this.selectionHandlers.size && this.listening) {
        this.services.eventBus.off('selection.changed', this.onSelectionChanged);
        this.listening = false;
      }
    };
  }

  clear(): void {
    this.services.selection.select([]);
    this.services.canvas.clear();
    this.shapes.clear();
    this.connections.clear();
  }

  private renderNode(node: ProjectionNode, nodes: Map<string, ProjectionNode>): void {
    const parent = node.parentId ? this.shapes.get(node.parentId) : undefined;
    const parentNode = node.parentId ? nodes.get(node.parentId) : undefined;
    const meffType = node.kind === 'element' ? 'Element' : node.kind === 'container' ? 'Container' : 'Label';
    const name = node.label ?? node.name ?? '';
    const type = diagramType(node.type, 'Note');
    const shape = this.services.elementFactory.createShape({
      id: node.id,
      x: node.x - (parentNode?.x ?? 0),
      y: node.y - (parentNode?.y ?? 0),
      width: node.width,
      height: node.height,
      type,
      name,
      style: rendererStyle(node.style),
      businessObject: {
        $type: 'archimate:Node',
        id: node.id,
        type: meffType === 'Label' ? 'Note' : meffType,
        meffType,
        style: modelStyle(node.style),
        elementRef: node.elementId ? { id: node.elementId, type: node.type, name: node.name } : undefined
      }
    });
    this.services.canvas.addShape(shape, parent);
    this.shapes.set(node.id, shape);
  }

  private renderConnection(connection: ProjectionConnection): void {
    const source = connection.sourceId ? this.shapes.get(connection.sourceId) : undefined;
    const target = connection.targetId ? this.shapes.get(connection.targetId) : undefined;
    if (!source || !target) return;
    const meffType = connection.type ? 'Relationship' : 'Line';
    const name = connection.label ?? connection.name ?? '';
    const shape = this.services.elementFactory.createConnection({
      id: connection.id,
      type: diagramType(connection.type, 'Line'),
      source,
      target,
      waypoints: structuredClone(connection.waypoints),
      name,
      style: rendererStyle(connection.style),
      businessObject: {
        $type: 'archimate:Connection',
        id: connection.id,
        meffType,
        style: modelStyle(connection.style),
        relationshipRef: connection.relationshipId ? {
          id: connection.relationshipId, name: connection.name, type: connection.type
        } : undefined
      }
    });
    this.services.canvas.addConnection(shape);
    this.connections.set(connection.id, shape);
  }
}
