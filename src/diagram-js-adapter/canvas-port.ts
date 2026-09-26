import type { CanvasPort, CanvasProjection, EditorCommand } from '../model-dto/editor.js';
import type { StyleDto } from '../model-dto/types.js';
import { invalid } from '../model-dto/validate.js';

interface CanvasElement {
  id?: string;
  parent?: unknown;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: CanvasElement[];
  source?: unknown;
  target?: unknown;
  waypoints?: unknown[];
}

interface DiagramJsCanvas {
  getRootElement(): unknown;
  addShape(shape: unknown, parent?: unknown): unknown;
  addConnection(connection: unknown): unknown;
  removeShape(shape: unknown): void;
  removeConnection(connection: unknown): void;
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

interface DiagramJsModeling {
  moveElements(shapes: unknown[], delta: { x: number; y: number }, target?: unknown,
    hints?: { attach?: boolean }): unknown;
  resizeShape(shape: unknown, bounds: { x: number; y: number; width: number; height: number },
    minBounds?: unknown, hints?: unknown): unknown;
  updateLabel(element: unknown, label: string, bounds?: unknown, hints?: unknown): unknown;
  createConnection(source: unknown, target: unknown, attrs: unknown, parent?: unknown, hints?: unknown): unknown;
  reconnect(connection: unknown, source: unknown, target: unknown, dockingOrPoints: unknown,
    hints?: unknown): unknown;
  removeElements(elements: unknown[]): unknown;
  removeShape(shape: unknown, hints?: unknown): unknown;
  removeConnection(connection: unknown, hints?: unknown): unknown;
}

/** Minimal service surface accepted from a live Viewer or Modeler instance. */
export interface DiagramJsCanvasServices {
  canvas: DiagramJsCanvas;
  elementFactory: DiagramJsElementFactory;
  eventBus: DiagramJsEventBus;
  selection: DiagramJsSelection;
  modeling?: DiagramJsModeling;
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
  private readonly currentNodes = new Map<string, ProjectionNode>();
  private readonly currentConnections = new Map<string, ProjectionConnection>();
  private readonly selectionHandlers = new Set<(ids: string[]) => void>();
  private rendering = false;
  private listening = false;
  private readonly restoreModeling: Array<() => void> = [];
  private viewId = '';
  private semanticNameNodeId?: string;
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

  beginSemanticNameEdit(nodeId: string): void {
    if (!this.currentNodes.get(nodeId)?.elementId) invalid();
    this.semanticNameNodeId = nodeId;
    this.services.eventBus.on('directEditing.complete', this.clearSemanticNameEdit);
    this.services.eventBus.on('directEditing.cancel', this.clearSemanticNameEdit);
  }

  private readonly clearSemanticNameEdit = (): void => {
    this.semanticNameNodeId = undefined;
    this.services.eventBus.off('directEditing.complete', this.clearSemanticNameEdit);
    this.services.eventBus.off('directEditing.cancel', this.clearSemanticNameEdit);
  };

  render(projection: CanvasProjection): void {
    this.rendering = true;
    try {
      this.clearCanvas();
      this.viewId = projection.viewId;
      const nodes = new Map(projection.nodes.map((node) => [node.id, node]));
      for (const node of projection.nodes) this.currentNodes.set(node.id, node);
      for (const connection of projection.connections) this.currentConnections.set(connection.id, connection);
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
    const modeling = this.services.modeling;
    if (!modeling) return () => {};

    const moveElements = modeling.moveElements;
    const resizeShape = modeling.resizeShape;
    const updateLabel = modeling.updateLabel;
    const restore: Array<() => void> = [];
    const install = (key: keyof DiagramJsModeling, original: (...args: never[]) => unknown,
      replacement: (...args: never[]) => unknown): void => {
      const service = modeling as unknown as Record<string, (...args: never[]) => unknown>;
      service[key] = replacement;
      restore.push(() => { if (service[key] === replacement) service[key] = original; });
    };

    install('moveElements', moveElements as (...args: never[]) => unknown,
      ((shapes: unknown[], delta: { x: number; y: number }, target?: unknown,
        hints?: { attach?: boolean }): undefined => {
        return this.routeMove(shapes, delta, target, hints, handler);
      }) as (...args: never[]) => unknown);
    install('resizeShape', resizeShape as (...args: never[]) => unknown,
      ((shape: unknown, bounds: { x: number; y: number; width: number; height: number }): undefined => {
        return this.routeResize(shape, bounds, handler);
      }) as (...args: never[]) => unknown);
    install('updateLabel', updateLabel as (...args: never[]) => unknown,
      ((element: unknown, label: string): undefined => {
        return this.routeLabel(element, label, handler);
      }) as (...args: never[]) => unknown);
    this.installTopology(modeling, handler, install);
    this.restoreModeling.push(...restore);
    return () => {
      this.clearSemanticNameEdit();
      for (const restoreMethod of restore.reverse()) restoreMethod();
      this.restoreModeling.splice(0, this.restoreModeling.length,
        ...this.restoreModeling.filter((restoreMethod) => !restore.includes(restoreMethod)));
    };
  }

  private installTopology(modeling: DiagramJsModeling, handler: (command: EditorCommand) => void,
    install: (key: keyof DiagramJsModeling, original: (...args: never[]) => unknown,
      replacement: (...args: never[]) => unknown) => void): void {
    install('createConnection', modeling.createConnection as (...args: never[]) => unknown,
      ((source: unknown, target: unknown, attrs: unknown): unknown =>
        this.routeConnect(source, target, attrs, handler)) as (...args: never[]) => unknown);
    install('reconnect', modeling.reconnect as (...args: never[]) => unknown,
      ((connection: unknown, source: unknown, target: unknown, docking: unknown): undefined =>
        this.routeReconnect(connection, source, target, docking, handler)) as (...args: never[]) => unknown);
    install('removeElements', modeling.removeElements as (...args: never[]) => unknown,
      ((elements: unknown[]): undefined => this.routeRemove(elements, handler)) as (...args: never[]) => unknown);
    install('removeShape', modeling.removeShape as (...args: never[]) => unknown,
      ((shape: unknown): undefined => this.routeRemove([shape], handler)) as (...args: never[]) => unknown);
    install('removeConnection', modeling.removeConnection as (...args: never[]) => unknown,
      ((connection: unknown): undefined => this.routeRemove([connection], handler)) as (...args: never[]) => unknown);
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
    for (const restore of this.restoreModeling.splice(0).reverse()) restore();
    this.clearCanvas();
  }

  private clearCanvas(): void {
    this.services.selection.select([]);
    const root = this.services.canvas.getRootElement();
    const shapes: unknown[] = [];
    const connections: unknown[] = [];
    const collect = (parent: CanvasElement): void => {
      for (const child of parent.children || []) {
        if (Array.isArray(child.waypoints) && child.source && child.target) connections.push(child);
        else shapes.push(child);
        collect(child);
      }
    };
    if (root && typeof root === 'object') collect(root as CanvasElement);
    for (const connection of connections) this.services.canvas.removeConnection(connection);
    for (const shape of shapes.reverse()) this.services.canvas.removeShape(shape);
    this.shapes.clear();
    this.connections.clear();
    this.currentNodes.clear();
    this.currentConnections.clear();
  }

  private elementId(element: unknown): string {
    if (!isElement(element) || (!this.shapes.has(element.id!) && !this.connections.has(element.id!))) invalid();
    return element.id!;
  }

  private nodeFor(element: unknown): ProjectionNode {
    const id = this.elementId(element);
    const node = this.currentNodes.get(id);
    if (!node) invalid();
    return node;
  }

  private routeMove(shapes: unknown[], delta: { x: number; y: number }, target: unknown,
    hints: { attach?: boolean } | undefined, handler: (command: EditorCommand) => void): undefined {
    if (!Array.isArray(shapes) || !shapes.length || hints?.attach === true ||
        !Number.isFinite(delta?.x) || !Number.isFinite(delta?.y)) invalid();
    const items = shapes.map((shape) => ({ shape, node: this.nodeFor(shape) }));
    const root = this.services.canvas.getRootElement();
    if (items.length === 1) {
      const { node } = items[0];
      const expectedParent = node.parentId ? this.shapes.get(node.parentId) : undefined;
      if (node.parentId ? target !== expectedParent : target != null && target !== root) invalid();
      handler({ type: 'move', viewId: this.viewId, nodeId: node.id, x: node.x + delta.x, y: node.y + delta.y });
      return undefined;
    }
    for (const { shape, node } of items) {
      const expectedParent = node.parentId ? this.shapes.get(node.parentId) : root;
      if (target != null && target !== expectedParent || isElement(shape) && shape.parent !== expectedParent) {
        invalid();
      }
    }
    handler({ type: 'move-many', viewId: this.viewId,
      moves: items.map(({ node }) => ({ nodeId: node.id, x: node.x + delta.x, y: node.y + delta.y })) });
    return undefined;
  }

  private routeResize(shape: unknown, bounds: { x: number; y: number; width: number; height: number },
    handler: (command: EditorCommand) => void): undefined {
    const node = this.nodeFor(shape);
    const parent = node.parentId ? this.currentNodes.get(node.parentId) : undefined;
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) invalid();
    handler({ type: 'resize', viewId: this.viewId, nodeId: node.id,
      x: bounds.x + (parent?.x ?? 0), y: bounds.y + (parent?.y ?? 0),
      width: bounds.width, height: bounds.height });
    return undefined;
  }

  private routeLabel(element: unknown, label: string,
    handler: (command: EditorCommand) => void): undefined {
    const id = this.elementId(element);
    if (!this.currentNodes.has(id) && !this.currentConnections.has(id) || typeof label !== 'string') invalid();
    const semanticNameNodeId = this.semanticNameNodeId;
    if (semanticNameNodeId === id) {
      const elementId = this.currentNodes.get(id)?.elementId;
      this.clearSemanticNameEdit();
      if (!elementId) invalid();
      handler({ type: 'concept-name', viewId: this.viewId, conceptId: elementId, name: label });
      return undefined;
    }
    handler({ type: 'label', viewId: this.viewId, itemId: id, label });
    return undefined;
  }

  private nodeId(element: unknown): string {
    const id = this.elementId(element);
    if (!this.currentNodes.get(id)?.elementId) invalid();
    return id;
  }

  private point(value: unknown, kind: 'sourceAttachment' | 'bendpoint' | 'targetAttachment') {
    if (!value || typeof value !== 'object') invalid();
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (typeof x !== 'number' || !Number.isFinite(x) ||
        typeof y !== 'number' || !Number.isFinite(y)) invalid();
    return { x: x as number, y: y as number, kind };
  }

  private center(value: unknown, kind: 'sourceAttachment' | 'targetAttachment') {
    const node = this.currentNodes.get(this.nodeId(value))!;
    return this.point({ x: Math.round(node.x + node.width / 2),
      y: Math.round(node.y + node.height / 2) }, kind);
  }

  private waypoints(input: unknown, source: unknown, target: unknown) {
    if (input === undefined) return [this.center(source, 'sourceAttachment'),
      this.center(target, 'targetAttachment')];
    if (!Array.isArray(input) || input.length < 2) invalid();
    return input.map((value, index) => this.point(value, index === 0 ? 'sourceAttachment' :
      index === input.length - 1 ? 'targetAttachment' : 'bendpoint'));
  }

  private routeConnect(source: unknown, target: unknown, attrs: unknown,
    handler: (command: EditorCommand) => void): unknown {
    const sourceId = this.nodeId(source);
    const targetId = this.nodeId(target);
    if (!attrs || typeof attrs !== 'object') invalid();
    const data = attrs as { id?: unknown; type?: unknown; relationshipRef?: { id?: unknown; type?: unknown };
      waypoints?: unknown };
    const rawType = data.relationshipRef?.type ?? data.type;
    if (typeof rawType !== 'string' || !rawType) invalid();
    const type = diagramType(rawType, '');
    if (!type || type === 'Relationship') invalid();
    const relationshipId = data.relationshipRef?.id ?? `relationship-${crypto.randomUUID()}`;
    const id = data.id ?? `connection-${crypto.randomUUID()}`;
    if (typeof relationshipId !== 'string' || typeof id !== 'string') invalid();
    const sourceElement = this.currentNodes.get(sourceId)!.elementId!;
    const targetElement = this.currentNodes.get(targetId)!.elementId!;
    const connection = { id, kind: 'relationship' as const, relationshipId, sourceId, targetId,
      waypoints: this.waypoints(data.waypoints, source, target) };
    handler({ type: 'connect', viewId: this.viewId, connection,
      relationship: data.relationshipRef ? undefined :
        { id: relationshipId, type: `archimate:${type}`, sourceId: sourceElement,
          targetId: targetElement } });
    return this.connections.get(id);
  }

  private routeReconnect(connection: unknown, source: unknown, target: unknown, docking: unknown,
    handler: (command: EditorCommand) => void): undefined {
    const id = this.elementId(connection);
    const current = this.currentConnections.get(id);
    if (!current?.type || !current.relationshipId) invalid();
    const sourceId = this.nodeId(source);
    const targetId = this.nodeId(target);
    let waypoints = this.waypoints(current.waypoints, source, target);
    if (Array.isArray(docking)) waypoints = this.waypoints(docking, source, target);
    else if (docking !== undefined) {
      const oldSource = current.sourceId === sourceId;
      const oldTarget = current.targetId === targetId;
      if (oldSource === oldTarget) invalid();
      waypoints[oldSource ? waypoints.length - 1 : 0] =
        this.point(docking, oldSource ? 'targetAttachment' : 'sourceAttachment');
    } else {
      if (current.sourceId !== sourceId) waypoints[0] = this.center(source, 'sourceAttachment');
      if (current.targetId !== targetId) waypoints[waypoints.length - 1] =
        this.center(target, 'targetAttachment');
    }
    handler({ type: 'reconnect', viewId: this.viewId, connectionId: id, sourceId, targetId, waypoints });
    return undefined;
  }

  private routeRemove(elements: unknown[], handler: (command: EditorCommand) => void): undefined {
    if (!Array.isArray(elements) || !elements.length) invalid();
    const itemIds = elements.map((element) => this.elementId(element));
    if (itemIds.length === 1) handler({ type: 'delete', viewId: this.viewId, itemId: itemIds[0] });
    else handler({ type: 'delete-many', viewId: this.viewId, itemIds });
    return undefined;
  }

  private renderNode(node: ProjectionNode, nodes: Map<string, ProjectionNode>): void {
    this.currentNodes.set(node.id, node);
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
        $instanceOf: (type: string) => type === 'archimate:Node',
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
        $instanceOf: (type: string) => type === 'archimate:Connection',
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
