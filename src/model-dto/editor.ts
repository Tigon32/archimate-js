import type {
  ModelDto, PointDto, PropertyValueDto, RelationshipDto, StyleDto, ViewConnectionDto, ViewNodeDto
} from './types.js';
import { exportModelDtoToMeff } from './meff-export.js';
import { assessModelDtoEditingEligibility, editingIneligibleError } from './eligibility.js';
import { invalid, isIdentifier, serializeModelDto, validateModelDto } from './validate.js';
import { validateRelationshipSemantics } from '../language/relationship-semantics.mjs';
import { rejectRelationshipEdit } from './editor-diagnostics.js';
import type { RelationshipEditOperation } from './editor-diagnostics.js';

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
  | { type: 'label'; viewId: string; itemId: string; label: string }
  | { type: 'concept-name'; viewId: string; conceptId: string; name?: string }
  | { type: 'concept-documentation'; viewId: string; conceptId: string; documentation?: string }
  | { type: 'property'; viewId: string; conceptId: string;
      propertyDefinitionId: string; values: PropertyValueDto[] };

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

function editConcept(model: ModelDto, command: Extract<EditorCommand,
  { type: 'concept-name' | 'concept-documentation' }>): void {
  const concept = [...model.elements, ...model.relationships].find((item) => item.id === command.conceptId);
  if (!concept) invalid();
  if (command.type === 'concept-name') concept.name = command.name;
  else concept.documentation = command.documentation;
}

function editProperty(model: ModelDto, command: Extract<EditorCommand, { type: 'property' }>): void {
  if (!Array.isArray(command.values)) invalid();
  if (!model.propertyDefinitions?.some((item) => item.id === command.propertyDefinitionId)) invalid();
  const concept = [...model.elements, ...model.relationships].find((item) => item.id === command.conceptId);
  if (!concept) invalid();
  const properties = concept.properties || [];
  const matches = properties.filter((item) => item.propertyDefinitionId === command.propertyDefinitionId);
  if (matches.length > 1) invalid();
  if (!command.values.length) {
    concept.properties = properties.filter((item) => item.propertyDefinitionId !== command.propertyDefinitionId);
    if (!concept.properties.length) delete concept.properties;
    return;
  }
  const replacement = { propertyDefinitionId: command.propertyDefinitionId,
    values: structuredClone(command.values) };
  concept.properties = matches.length ? properties.map((item) =>
    item.propertyDefinitionId === command.propertyDefinitionId ? replacement : item) :
    [...properties, replacement];
}

type RelationshipContext = {
  viewId: string;
  connectionId?: string;
  relationshipId?: string;
  sourceId?: string;
  targetId?: string;
  sourceElementId?: string;
  targetElementId?: string;
};

function checkRelationshipIds(command: Extract<EditorCommand, { type: 'connect' | 'reconnect' }>): void {
  const identifiers = command.type === 'connect' ? [
    ['viewId', command.viewId], ['connectionId', command.connection.id],
    ['relationshipId', command.connection.relationshipId],
    ['sourceId', command.connection.sourceId], ['targetId', command.connection.targetId],
    ['relationshipId', command.relationship?.id],
    ['sourceElementId', command.relationship?.sourceId],
    ['targetElementId', command.relationship?.targetId]
  ] as const : [
    ['viewId', command.viewId], ['connectionId', command.connectionId],
    ['sourceId', command.sourceId], ['targetId', command.targetId]
  ] as const;
  const malformed = identifiers.find(([, id]) => id !== undefined && !isIdentifier(id));
  if (!malformed) return;
  const context: RelationshipContext = {
    viewId: command.viewId,
    connectionId: command.type === 'connect' ? command.connection.id : command.connectionId,
    relationshipId: command.type === 'connect' ? command.connection.relationshipId : undefined,
    sourceId: command.type === 'connect' ? command.connection.sourceId : command.sourceId,
    targetId: command.type === 'connect' ? command.connection.targetId : command.targetId,
    sourceElementId: command.type === 'connect' ? command.relationship?.sourceId : undefined,
    targetElementId: command.type === 'connect' ? command.relationship?.targetId : undefined
  };
  const [field, value] = malformed;
  if (field === 'connectionId' && typeof value === 'string') context.connectionId = value;
  if (field === 'relationshipId' && typeof value === 'string') context.relationshipId = value;
  if (field === 'sourceId' && typeof value === 'string') context.sourceId = value;
  if (field === 'targetId' && typeof value === 'string') context.targetId = value;
  if (field === 'sourceElementId' && typeof value === 'string') context.sourceElementId = value;
  if (field === 'targetElementId' && typeof value === 'string') context.targetElementId = value;
  rejectRelationshipEdit('DTO_RELATIONSHIP_MALFORMED_ID', command.type, context);
}

function conceptAt(view: ModelDto['views'][number], nodeId: string | undefined,
  operation: RelationshipEditOperation, context: RelationshipContext): string {
  const node = nodeId && findNode(view.nodes, nodeId);
  if (!node || node.kind !== 'element' || !node.elementId) {
    rejectRelationshipEdit('DTO_RELATIONSHIP_ENDPOINT_INVALID', operation, context);
  }
  return node.elementId;
}

function checkEndpoints(model: ModelDto, view: ModelDto['views'][number],
  connection: ViewConnectionDto, operation: RelationshipEditOperation): RelationshipDto {
  const context = { viewId: view.id, connectionId: connection.id,
    relationshipId: connection.relationshipId,
    sourceId: connection.sourceId, targetId: connection.targetId };
  if (connection.kind !== 'relationship' || !connection.relationshipId) {
    rejectRelationshipEdit('DTO_RELATIONSHIP_ENDPOINT_INVALID', operation, context);
  }
  const relationship = model.relationships.find((item) => item.id === connection.relationshipId);
  if (!relationship) rejectRelationshipEdit('DTO_RELATIONSHIP_NOT_FOUND', operation, context);
  const sourceId = conceptAt(view, connection.sourceId, operation, context);
  const targetId = conceptAt(view, connection.targetId, operation, context);
  if (relationship.sourceId !== sourceId || relationship.targetId !== targetId) {
    rejectRelationshipEdit('DTO_RELATIONSHIP_ENDPOINT_MISMATCH', operation,
      { ...context, sourceElementId: sourceId, targetElementId: targetId });
  }
  return relationship;
}

function checkRelationshipDecision(model: ModelDto, relationship: RelationshipDto,
  operation: RelationshipEditOperation, context: RelationshipContext): void {
  const source = model.elements.find((element) => element.id === relationship.sourceId);
  const target = model.elements.find((element) => element.id === relationship.targetId);
  if (!source || !target) {
    rejectRelationshipEdit('DTO_RELATIONSHIP_ENDPOINT_INVALID', operation, context);
  }
  const result = validateRelationshipSemantics({ sourceType: source.type,
    relationshipType: relationship.type, targetType: target.type });
  if (result.decision === 'allowed') return;
  rejectRelationshipEdit(result.decision === 'disallowed' ?
    'DTO_RELATIONSHIP_DISALLOWED' : 'DTO_RELATIONSHIP_UNSUPPORTED', operation, context);
}

function connect(model: ModelDto, view: ModelDto['views'][number],
  command: Extract<EditorCommand, { type: 'connect' }>): void {
  const context = { viewId: view.id, connectionId: command.connection.id,
    relationshipId: command.connection.relationshipId,
    sourceId: command.connection.sourceId, targetId: command.connection.targetId };
  if (view.connections.some((connection) => connection.id === command.connection.id)) {
    rejectRelationshipEdit('DTO_RELATIONSHIP_DUPLICATE_CONNECTION', 'connect', context);
  }
  if (command.relationship) {
    const submitted = { ...context, relationshipId: command.relationship.id };
    if (command.connection.relationshipId !== command.relationship.id) {
      rejectRelationshipEdit('DTO_RELATIONSHIP_ID_MISMATCH', 'connect', submitted);
    }
    if (model.relationships.some((item) => item.id === command.relationship!.id) ||
        model.elements.some((item) => item.id === command.relationship!.id)) {
      rejectRelationshipEdit('DTO_RELATIONSHIP_ID_CONFLICT', 'connect', submitted);
    }
    model.relationships.push(command.relationship);
  }
  if (command.connection.kind === 'relationship') {
    const relationship = checkEndpoints(model, view, command.connection, 'connect');
    checkRelationshipDecision(model, relationship, 'connect', { ...context,
      sourceElementId: relationship.sourceId, targetElementId: relationship.targetId });
  }
  else if (command.relationship) {
    rejectRelationshipEdit('DTO_RELATIONSHIP_ENDPOINT_INVALID', 'connect', context);
  }
  view.connections.push(command.connection);
}

function reconnect(model: ModelDto, view: ModelDto['views'][number],
  command: Extract<EditorCommand, { type: 'reconnect' }>): void {
  const connection = view.connections.find((item) => item.id === command.connectionId);
  if (!connection) rejectRelationshipEdit('DTO_RELATIONSHIP_CONNECTION_NOT_FOUND', 'reconnect',
    { viewId: view.id, connectionId: command.connectionId });
  if (connection.kind === 'relationship') {
    const relationship = model.relationships.find((item) => item.id === connection.relationshipId);
    const context = { viewId: view.id, connectionId: connection.id,
      relationshipId: connection.relationshipId,
      sourceId: command.sourceId, targetId: command.targetId };
    if (!relationship) rejectRelationshipEdit('DTO_RELATIONSHIP_NOT_FOUND', 'reconnect', context);
    const sourceId = conceptAt(view, command.sourceId, 'reconnect', context);
    const targetId = conceptAt(view, command.targetId, 'reconnect', context);
    const semanticContext = { ...context, sourceElementId: sourceId, targetElementId: targetId };
    const changed = relationship.sourceId !== sourceId || relationship.targetId !== targetId;
    if (changed &&
        model.views.some((item) => item.connections.some((candidate) =>
          candidate !== connection && candidate.relationshipId === relationship.id))) {
      rejectRelationshipEdit('DTO_RELATIONSHIP_RETARGET_CONFLICT', 'reconnect', semanticContext);
    }
    if (changed) checkRelationshipDecision(model, { ...relationship, sourceId, targetId },
      'reconnect', semanticContext);
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

function viewForCommand(model: ModelDto, command: EditorCommand): ModelDto['views'][number] {
  const view = model.views.find((item) => item.id === command.viewId);
  if (view) return view;
  if (command.type === 'connect' || command.type === 'reconnect') {
    rejectRelationshipEdit('DTO_RELATIONSHIP_VIEW_NOT_FOUND', command.type, {
      viewId: command.viewId,
      connectionId: command.type === 'connect' ? command.connection.id : command.connectionId,
      relationshipId: command.type === 'connect' ? command.connection.relationshipId : undefined,
      sourceId: command.type === 'connect' ? command.connection.sourceId : command.sourceId,
      targetId: command.type === 'connect' ? command.connection.targetId : command.targetId
    });
  }
  invalid();
}

function apply(model: ModelDto, command: EditorCommand): ModelDto {
  if (command.type === 'connect' || command.type === 'reconnect') checkRelationshipIds(command);
  const next = structuredClone(model);
  const view = viewForCommand(next, command);

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
  case 'concept-name':
  case 'concept-documentation':
    editConcept(next, command);
    break;
  case 'property':
    editProperty(next, command);
    break;
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
