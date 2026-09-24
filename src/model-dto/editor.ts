import type { ModelDto, PointDto, ViewConnectionDto, ViewNodeDto } from './types.js';
import { exportModelDtoToMeff } from './meff-export.js';
import { assessModelDtoEditingEligibility, editingIneligibleError } from './eligibility.js';
import { invalid, serializeModelDto, validateModelDto } from './validate.js';

/** The canvas receives values and identifiers, never mutable diagram-js objects. */
export interface CanvasProjection {
  viewId: string;
  nodes: Array<{ id: string; parentId?: string; elementId?: string; kind: ViewNodeDto['kind'];
    x: number; y: number; width: number; height: number; label?: string }>;
  connections: Array<{ id: string; sourceId?: string; targetId?: string;
    waypoints: PointDto[]; label?: string }>;
  selectedIds: string[];
}

export type EditorCommand =
  | { type: 'move'; viewId: string; nodeId: string; x: number; y: number }
  | { type: 'resize'; viewId: string; nodeId: string; x: number; y: number; width: number; height: number }
  | { type: 'connect'; viewId: string; connection: ViewConnectionDto }
  | { type: 'reconnect'; viewId: string; connectionId: string; sourceId?: string; targetId?: string;
      waypoints: PointDto[] }
  | { type: 'delete'; viewId: string; itemId: string }
  | { type: 'label'; viewId: string; itemId: string; label: string };

export type EditorEvent = { type: 'changed' | 'selection'; viewId: string; model: ModelDto;
  selectedIds: string[] };

export interface CanvasPort {
  render(projection: CanvasProjection): void;
  onCommand(handler: (command: EditorCommand) => void): () => void;
  onSelection(handler: (ids: string[]) => void): () => void;
}

function findNode(nodes: ViewNodeDto[], id: string): ViewNodeDto | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.nodes, id);
    if (child) return child;
  }
  return undefined;
}

function nodesOf(nodes: ViewNodeDto[], parentId?: string): CanvasProjection['nodes'] {
  return nodes.flatMap((node): CanvasProjection['nodes'] => [
    { id: node.id, parentId, elementId: node.elementId, kind: node.kind,
      x: node.x, y: node.y, width: node.width, height: node.height, label: node.label },
    ...nodesOf(node.nodes, node.id)
  ]);
}

function moveChildren(node: ViewNodeDto, dx: number, dy: number): void {
  node.x += dx;
  node.y += dy;
  node.nodes.forEach((child) => moveChildren(child, dx, dy));
}

function descendants(node: ViewNodeDto): Set<string> {
  const ids = new Set([node.id]);
  for (const child of node.nodes) for (const id of descendants(child)) ids.add(id);
  return ids;
}

function removeNode(nodes: ViewNodeDto[], id: string): ViewNodeDto | undefined {
  const index = nodes.findIndex((node) => node.id === id);
  if (index !== -1) return nodes.splice(index, 1)[0];
  for (const node of nodes) {
    const removed = removeNode(node.nodes, id);
    if (removed) return removed;
  }
  return undefined;
}

function changeBounds(view: ModelDto['views'][number], command: Extract<EditorCommand,
  { type: 'move' | 'resize' }>): void {
  const node = findNode(view.nodes, command.nodeId);
  if (!node) invalid();
  const dx = command.x - node.x;
  const dy = command.y - node.y;
  moveChildren(node, dx, dy);
  if (command.type === 'resize') {
    node.width = command.width;
    node.height = command.height;
  }
  const movedIds = descendants(node);
  for (const connection of view.connections) {
    if (movedIds.has(connection.sourceId || '')) {
      connection.waypoints[0].x += dx;
      connection.waypoints[0].y += dy;
    }
    if (movedIds.has(connection.targetId || '')) {
      const last = connection.waypoints.at(-1)!;
      last.x += dx;
      last.y += dy;
    }
  }
}

function deleteItem(view: ModelDto['views'][number], itemId: string): void {
  const node = removeNode(view.nodes, itemId);
  if (node) {
    const deletedIds = descendants(node);
    view.connections = view.connections.filter((item) => !deletedIds.has(item.sourceId || '') &&
      !deletedIds.has(item.targetId || ''));
    return;
  }
  const index = view.connections.findIndex((item) => item.id === itemId);
  if (index === -1) invalid();
  view.connections.splice(index, 1);
}

/** Reject fields that DTO validation would omit, including nested canvas objects. */
function sameData(source: unknown, target: unknown): boolean {
  if (Object.is(source, target)) return true;
  if (Array.isArray(source) || Array.isArray(target)) return Array.isArray(source) &&
    Array.isArray(target) && source.length === target.length &&
    source.every((item, index) => sameData(item, target[index]));
  if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return false;
  const left = source as Record<string, unknown>;
  const right = target as Record<string, unknown>;
  const keys = Reflect.ownKeys(left).filter((key) => left[key as string] !== undefined);
  const expected = Reflect.ownKeys(right).filter((key) => right[key as string] !== undefined);
  return keys.length === expected.length && keys.every((key) =>
    Reflect.has(right, key) && sameData(left[key as string], right[key as string]));
}

function apply(model: ModelDto, command: EditorCommand): ModelDto {
  const next = structuredClone(model);
  const view = next.views.find((item) => item.id === command.viewId);
  if (!view) invalid();

  switch (command.type) {
  case 'move':
  case 'resize':
    changeBounds(view, command);
    break;
  case 'connect':
    if (view.connections.some((connection) => connection.id === command.connection.id)) invalid();
    view.connections.push(command.connection);
    break;
  case 'reconnect': {
    const connection = view.connections.find((item) => item.id === command.connectionId);
    if (!connection) invalid();
    connection.sourceId = command.sourceId;
    connection.targetId = command.targetId;
    connection.waypoints = command.waypoints;
    break;
  }
  case 'delete':
    deleteItem(view, command.itemId);
    break;
  case 'label': {
    const item = findNode(view.nodes, command.itemId) ||
      view.connections.find((connection) => connection.id === command.itemId);
    if (!item) invalid();
    item.label = command.label;
    break;
  }
  default:
    invalid();
  }
  const validated = validateModelDto(next);
  if (!sameData(next, validated)) invalid();
  return validated;
}

/** Owns persistent editor state; callers can only exchange validated DTO values. */
export class DiagramAdapter {
  private model: ModelDto;
  private past: Array<{ model: ModelDto; viewId: string }> = [];
  private future: Array<{ model: ModelDto; viewId: string }> = [];
  private selection = new Map<string, string[]>();
  private listeners = new Set<(event: EditorEvent) => void>();
  private canvases = new Map<CanvasPort, string>();

  constructor(model: unknown) {
    const eligibility = assessModelDtoEditingEligibility(model);
    if (!eligibility.eligible || !sameData(model, eligibility.model)) throw editingIneligibleError();
    this.model = eligibility.model;
  }

  getModel(): ModelDto { return structuredClone(this.model); }
  serialize(): string { return serializeModelDto(this.model); }
  exportMeff(): string { return exportModelDtoToMeff(this.model); }

  project(viewId: string): CanvasProjection {
    const view = this.model.views.find((item) => item.id === viewId);
    if (!view) invalid();
    return { viewId, nodes: nodesOf(view.nodes), connections: view.connections.map((item) => ({
      id: item.id, sourceId: item.sourceId, targetId: item.targetId,
      waypoints: structuredClone(item.waypoints), label: item.label
    })), selectedIds: [...(this.selection.get(viewId) || [])] };
  }

  subscribe(listener: (event: EditorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A UI port translates native canvas events to ID-only commands and selection. */
  attach(viewId: string, port: CanvasPort): () => void {
    if (this.canvases.has(port)) invalid();
    port.render(this.project(viewId));
    const offCommand = port.onCommand((command) => {
      if (command.viewId !== viewId) invalid();
      this.execute(command);
    });
    let offSelection: () => void;
    try { offSelection = port.onSelection((ids) => { this.select(viewId, ids); }); }
    catch (error) { offCommand(); throw error; }
    this.canvases.set(port, viewId);
    return () => { offCommand(); offSelection(); this.canvases.delete(port); };
  }

  select(viewId: string, ids: string[]): void {
    const projection = this.project(viewId);
    const available = new Set([...projection.nodes, ...projection.connections].map((item) => item.id));
    if (!Array.isArray(ids) || ids.some((id) => !available.has(id))) invalid();
    this.selection.set(viewId, [...new Set(ids)]);
    this.emit('selection', viewId);
  }

  execute(command: EditorCommand): void {
    const next = apply(this.model, command);
    this.past.push({ model: this.model, viewId: command.viewId });
    this.model = next;
    this.future = [];
    this.pruneSelection(command.viewId);
    this.emit('changed', command.viewId);
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push({ model: this.model, viewId: previous.viewId });
    this.model = previous.model;
    this.pruneSelection(previous.viewId);
    this.emit('changed', previous.viewId);
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push({ model: this.model, viewId: next.viewId });
    this.model = next.model;
    this.pruneSelection(next.viewId);
    this.emit('changed', next.viewId);
    return true;
  }

  private pruneSelection(viewId: string): void {
    const projection = this.project(viewId);
    const available = new Set([...projection.nodes, ...projection.connections].map((item) => item.id));
    this.selection.set(viewId, (this.selection.get(viewId) || []).filter((id) => available.has(id)));
  }

  private emit(type: EditorEvent['type'], viewId: string): void {
    for (const [port, boundView] of this.canvases) if (boundView === viewId) {
      port.render(this.project(viewId));
    }
    for (const listener of this.listeners) listener({ type, viewId,
      model: this.getModel(), selectedIds: [...(this.selection.get(viewId) || [])] });
  }
}
