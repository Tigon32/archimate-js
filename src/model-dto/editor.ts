import type { ModelDto, PointDto, RelationshipDto, StyleDto, ViewConnectionDto, ViewNodeDto } from './types.js';
import { exportModelDtoToMeff } from './meff-export.js';
import { assessModelDtoEditingEligibility, editingIneligibleError } from './eligibility.js';
import { invalid, serializeModelDto, validateModelDto } from './validate.js';
import { validateRelationshipSemantics } from '../language/relationship-semantics.mjs';

/** The canvas receives values and identifiers, never mutable diagram-js objects. */
export interface CanvasProjection {
  viewId: string;
  nodes: Array<{ id: string; parentId?: string; elementId?: string; kind: ViewNodeDto['kind'];
    type?: string; name?: string; x: number; y: number; width: number; height: number;
    label?: string; style?: StyleDto }>;
  connections: Array<{ id: string; relationshipId?: string; sourceId?: string; targetId?: string;
    type?: string; name?: string; waypoints: PointDto[]; label?: string; style?: StyleDto }>;
  selectedIds: string[];
}

export type EditorCommand =
  | { type: 'move'; viewId: string; nodeId: string; x: number; y: number }
  | { type: 'resize'; viewId: string; nodeId: string; x: number; y: number; width: number; height: number }
  | { type: 'connect'; viewId: string; connection: ViewConnectionDto; relationship?: RelationshipDto }
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
  clear?(): void;
}

function findNode(nodes: ViewNodeDto[], id: string): ViewNodeDto | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.nodes, id);
    if (child) return child;
  }
  return undefined;
}

function nodesOf(nodes: ViewNodeDto[], elements: ModelDto['elements'], parentId?: string): CanvasProjection['nodes'] {
  return nodes.flatMap((node): CanvasProjection['nodes'] => [
    { id: node.id, parentId, elementId: node.elementId, kind: node.kind,
      type: elements.find((item) => item.id === node.elementId)?.type,
      name: elements.find((item) => item.id === node.elementId)?.name,
      x: node.x, y: node.y, width: node.width, height: node.height, label: node.label,
      style: node.style ? structuredClone(node.style) : undefined },
    ...nodesOf(node.nodes, elements, node.id)
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

function conceptAt(view: ModelDto['views'][number], nodeId: string | undefined): string {
  const node = nodeId && findNode(view.nodes, nodeId);
  if (!node || node.kind !== 'element' || !node.elementId) invalid();
  return node.elementId;
}

function checkEndpoints(model: ModelDto, view: ModelDto['views'][number],
  connection: ViewConnectionDto): void {
  if (connection.kind !== 'relationship' || !connection.relationshipId) invalid();
  const relationship = model.relationships.find((item) => item.id === connection.relationshipId);
  if (!relationship || relationship.sourceId !== conceptAt(view, connection.sourceId) ||
      relationship.targetId !== conceptAt(view, connection.targetId)) invalid();
}

function checkRelationshipDecision(model: ModelDto, relationship: RelationshipDto): void {
  const source = model.elements.find((element) => element.id === relationship.sourceId);
  const target = model.elements.find((element) => element.id === relationship.targetId);
  if (!source || !target) invalid();
  const result = validateRelationshipSemantics({ sourceType: source.type,
    relationshipType: relationship.type, targetType: target.type });
  if (result.decision === 'allowed') return;
  const error = new TypeError(result.decision === 'disallowed' ?
    'The relationship edit is disallowed by the reviewed ArchiMate 3.2 profile.' :
    'The relationship edit is outside the reviewed ArchiMate 3.2 decision set.');
  Object.assign(error, { code: result.decision === 'disallowed' ?
    'DTO_RELATIONSHIP_DISALLOWED' : 'DTO_RELATIONSHIP_UNSUPPORTED' });
  throw error;
}

function connect(model: ModelDto, view: ModelDto['views'][number],
  command: Extract<EditorCommand, { type: 'connect' }>): void {
  if (view.connections.some((connection) => connection.id === command.connection.id)) invalid();
  if (command.relationship) {
    if (command.connection.relationshipId !== command.relationship.id ||
        model.relationships.some((item) => item.id === command.relationship!.id) ||
        model.elements.some((item) => item.id === command.relationship!.id)) invalid();
    model.relationships.push(command.relationship);
  }
  if (command.connection.kind === 'relationship') {
    checkEndpoints(model, view, command.connection);
    // A second view reference does not create or retarget an imported relationship.
    if (command.relationship) checkRelationshipDecision(model, command.relationship);
  }
  else if (command.relationship) invalid();
  view.connections.push(command.connection);
}

function reconnect(model: ModelDto, view: ModelDto['views'][number],
  command: Extract<EditorCommand, { type: 'reconnect' }>): void {
  const connection = view.connections.find((item) => item.id === command.connectionId);
  if (!connection) invalid();
  if (connection.kind === 'relationship') {
    const relationship = model.relationships.find((item) => item.id === connection.relationshipId);
    if (!relationship) invalid();
    const sourceId = conceptAt(view, command.sourceId);
    const targetId = conceptAt(view, command.targetId);
    const changed = relationship.sourceId !== sourceId || relationship.targetId !== targetId;
    if (changed &&
        model.views.some((item) => item.connections.some((candidate) =>
          candidate !== connection && candidate.relationshipId === relationship.id))) invalid();
    if (changed) checkRelationshipDecision(model, { ...relationship, sourceId, targetId });
    relationship.sourceId = sourceId;
    relationship.targetId = targetId;
  }
  connection.sourceId = command.sourceId;
  connection.targetId = command.targetId;
  connection.waypoints = command.waypoints;
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
    connect(next, view, command);
    break;
  case 'reconnect':
    reconnect(next, view, command);
    break;
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
    return { viewId, nodes: nodesOf(view.nodes, this.model.elements), connections: view.connections.map((item) => ({
      id: item.id, sourceId: item.sourceId, targetId: item.targetId,
      relationshipId: item.relationshipId,
      type: this.model.relationships.find((relationship) => relationship.id === item.relationshipId)?.type,
      name: this.model.relationships.find((relationship) => relationship.id === item.relationshipId)?.name,
      waypoints: structuredClone(item.waypoints), label: item.label,
      style: item.style ? structuredClone(item.style) : undefined
    })), selectedIds: [...(this.selection.get(viewId) || [])] };
  }

  subscribe(listener: (event: EditorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A UI port translates native canvas events to ID-only commands and selection. */
  attach(viewId: string, port: CanvasPort): () => void {
    if (this.canvases.size || this.canvases.has(port)) invalid();
    port.render(this.project(viewId));
    const offCommand = port.onCommand((command) => {
      if (command.viewId !== viewId) invalid();
      this.execute(command);
    });
    let offSelection: () => void;
    try { offSelection = port.onSelection((ids) => { this.select(viewId, ids); }); }
    catch (error) { offCommand(); port.clear?.(); throw error; }
    this.canvases.set(port, viewId);
    return () => { offCommand(); offSelection(); this.canvases.delete(port); port.clear?.(); };
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
