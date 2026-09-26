import type {
  ElementDto, ModelDto, PointDto, PropertyValueDto, RelationshipDto, ViewConnectionDto, ViewNodeDto
} from './types.js';
import type { LayoutPatch } from '../layout/types.js';
import { exportModelDtoToMeff } from './meff-export.js';
import { assessModelDtoEditingEligibility, editingIneligibleError } from './eligibility.js';
import { invalid, isIdentifier, serializeModelDto, validateModelDto } from './validate.js';
import { parseSemanticProfile, validateRelationshipSemantics } from '../language/relationship-semantics.mjs';
import type { SemanticProfile } from '../language/semantic-profile.mjs';
import { rejectRelationshipEdit } from './editor-diagnostics.js';
import type { RelationshipEditOperation } from './editor-diagnostics.js';
import {
  applyLayoutPatch, changeBounds, deleteItem, deleteMany, findNode, moveMany, nodesOf, viewForCommand
} from './editor-view.js';
import {
  createElement, createRelatedElement, createRelationship, duplicateSelection
} from './editor-create.js';
import {
  buildOperationLog, EditorOperationLogError, MAX_EDITOR_OPERATIONS, parseOperationLog,
  serializeOperationLog,
  validateEditorCommand, validateOperationLog
} from './editor-operation-log.js';
import type {
  EditorOperation, EditorOperationAction, EditorOperationLog
} from './editor-operation-log.js';
import type { AttachedCanvas, CanvasPort, CanvasProjection } from './editor-canvas.js';

export type { CanvasPort, CanvasProjection } from './editor-canvas.js';

export type EditorCommand =
  | { type: 'create-element'; viewId: string; element: ElementDto; node: ViewNodeDto }
  | { type: 'create-relationship'; viewId: string; relationship: RelationshipDto;
      connection: ViewConnectionDto }
  | { type: 'create-related-element'; viewId: string; element: ElementDto; node: ViewNodeDto;
      relationship: RelationshipDto; connection: ViewConnectionDto }
  | { type: 'duplicate-selection'; viewId: string; elements: ElementDto[];
      nodes: Array<{ node: ViewNodeDto; parentId?: string }>;
      relationships: RelationshipDto[]; connections: ViewConnectionDto[] }
  | { type: 'move'; viewId: string; nodeId: string; x: number; y: number }
  | { type: 'move-many'; viewId: string; moves: Array<{ nodeId: string; x: number; y: number }> }
  | { type: 'resize'; viewId: string; nodeId: string; x: number; y: number; width: number; height: number }
  | { type: 'connect'; viewId: string; connection: ViewConnectionDto; relationship?: RelationshipDto }
  | { type: 'reconnect'; viewId: string; connectionId: string; sourceId?: string; targetId?: string;
      waypoints: PointDto[] }
  | { type: 'delete'; viewId: string; itemId: string }
  | { type: 'delete-many'; viewId: string; itemIds: string[] }
  | { type: 'apply-layout-patch'; viewId: string; patch: LayoutPatch; side: 'after' | 'before' }
  | { type: 'label'; viewId: string; itemId: string; label: string }
  | { type: 'concept-name'; viewId: string; conceptId: string; name?: string }
  | { type: 'concept-documentation'; viewId: string; conceptId: string; documentation?: string }
  | { type: 'property'; viewId: string; conceptId: string;
      propertyDefinitionId: string; values: PropertyValueDto[] };

export type EditorEvent = { type: 'changed' | 'selection'; viewId: string; model: ModelDto;
  selectedIds: string[] };

export interface DiagramAdapterOptions { semanticProfile?: unknown }

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

function contextOf(command: Extract<EditorCommand, { type: 'connect' | 'reconnect' }>): RelationshipContext {
  return {
    viewId: command.viewId,
    connectionId: command.type === 'connect' ? command.connection.id : command.connectionId,
    relationshipId: command.type === 'connect' ? command.connection.relationshipId : undefined,
    sourceId: command.type === 'connect' ? command.connection.sourceId : command.sourceId,
    targetId: command.type === 'connect' ? command.connection.targetId : command.targetId,
    sourceElementId: command.type === 'connect' ? command.relationship?.sourceId : undefined,
    targetElementId: command.type === 'connect' ? command.relationship?.targetId : undefined
  };
}

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
  const context = contextOf(command);
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
  operation: RelationshipEditOperation, context: RelationshipContext,
  semanticProfile?: SemanticProfile): void {
  const source = model.elements.find((element) => element.id === relationship.sourceId);
  const target = model.elements.find((element) => element.id === relationship.targetId);
  if (!source || !target) {
    rejectRelationshipEdit('DTO_RELATIONSHIP_ENDPOINT_INVALID', operation, context);
  }
  const result = validateRelationshipSemantics({ sourceType: source.type,
    relationshipType: relationship.type, targetType: target.type }, semanticProfile);
  if (result.decision === 'allowed') return;
  rejectRelationshipEdit(result.decision === 'disallowed' ?
    'DTO_RELATIONSHIP_DISALLOWED' : 'DTO_RELATIONSHIP_UNSUPPORTED', operation, context);
}

function connect(model: ModelDto, view: ModelDto['views'][number],
  command: Extract<EditorCommand, { type: 'connect' }>,
  semanticProfile?: SemanticProfile): void {
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
      sourceElementId: relationship.sourceId, targetElementId: relationship.targetId },
    semanticProfile);
  }
  else if (command.relationship) {
    rejectRelationshipEdit('DTO_RELATIONSHIP_ENDPOINT_INVALID', 'connect', context);
  }
  view.connections.push(command.connection);
}

function reconnect(model: ModelDto, view: ModelDto['views'][number],
  command: Extract<EditorCommand, { type: 'reconnect' }>,
  semanticProfile?: SemanticProfile): void {
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
      'reconnect', semanticContext, semanticProfile);
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

function applyCreateCommand(model: ModelDto, command: EditorCommand,
  semanticProfile?: SemanticProfile): ModelDto | undefined {
  if (command.type === 'create-element') return createElement(model, command);
  if (command.type === 'create-relationship') return createRelationship(model, command, semanticProfile);
  if (command.type === 'create-related-element') return createRelatedElement(model, command, semanticProfile);
  if (command.type === 'duplicate-selection') return duplicateSelection(model, command, semanticProfile);
  return undefined;
}

function apply(model: ModelDto, command: EditorCommand, semanticProfile?: SemanticProfile): ModelDto {
  if (command.type === 'connect' || command.type === 'reconnect') checkRelationshipIds(command);
  const next = structuredClone(model);
  const view = viewForCommand(next, command);
  const created = applyCreateCommand(next, command, semanticProfile);
  if (created) return created;

  switch (command.type) {
  case 'move':
  case 'resize':
    changeBounds(view, command);
    break;
  case 'move-many':
    moveMany(view, command);
    break;
  case 'connect':
    connect(next, view, command, semanticProfile);
    break;
  case 'reconnect':
    reconnect(next, view, command, semanticProfile);
    break;
  case 'delete':
    deleteItem(view, command.itemId);
    break;
  case 'delete-many':
    deleteMany(view, command);
    break;
  case 'apply-layout-patch':
    applyLayoutPatch(view, command);
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

function commandForExecution(input: unknown): EditorCommand {
  try { return validateEditorCommand(input); }
  catch (error) {
    if (error instanceof EditorOperationLogError) invalid();
    throw error;
  }
}

/** Owns persistent editor state; callers can only exchange validated DTO values. */
export class DiagramAdapter {
  private model: ModelDto;
  private past: Array<{ model: ModelDto; viewId: string }> = [];
  private future: Array<{ model: ModelDto; viewId: string }> = [];
  private operations: Array<Pick<EditorOperation, 'action' | 'command'>> = [];
  private operationSequence = 0;
  private selection = new Map<string, string[]>();
  private listeners = new Set<(event: EditorEvent) => void>();
  private canvases = new Map<CanvasPort, AttachedCanvas>();
  private readonly semanticProfile?: SemanticProfile;

  constructor(model: unknown, options: DiagramAdapterOptions = {}) {
    const eligibility = assessModelDtoEditingEligibility(model);
    if (!eligibility.eligible || !sameData(model, eligibility.model)) throw editingIneligibleError();
    this.model = eligibility.model;
    this.semanticProfile = options.semanticProfile === undefined ? undefined :
      parseSemanticProfile(options.semanticProfile);
  }

  getModel(): ModelDto { return structuredClone(this.model); }
  getSemanticProfile(): SemanticProfile | undefined { return this.semanticProfile; }
  serialize(): string { return serializeModelDto(this.model); }
  exportMeff(): string { return exportModelDtoToMeff(this.model); }
  exportOperationLog(clientId: string): EditorOperationLog {
    return buildOperationLog(clientId, this.operations);
  }
  serializeOperationLog(clientId: string): string {
    return serializeOperationLog(this.exportOperationLog(clientId));
  }

  replayOperationLog(input: unknown): void {
    if (this.operations.length || this.past.length || this.future.length) {
      throw new EditorOperationLogError('EDITOR_OPERATION_REPLAY_NOT_FRESH');
    }
    const log = typeof input === 'string' ? parseOperationLog(input) : validateOperationLog(input);
    const candidate = new DiagramAdapter(this.model, { semanticProfile: this.semanticProfile });
    const changedViewIds = new Set<string>();
    candidate.subscribe((event) => {
      if (event.type === 'changed') changedViewIds.add(event.viewId);
    });
    for (const entry of log.operations) this.replayOperation(candidate, entry);
    if (serializeOperationLog(candidate.exportOperationLog(log.clientId)) !==
        serializeOperationLog(log)) {
      throw new EditorOperationLogError('EDITOR_OPERATION_LOG_INVALID');
    }
    this.model = candidate.model;
    this.past = candidate.past;
    this.future = candidate.future;
    this.operations = candidate.operations;
    this.operationSequence = candidate.operationSequence;
    for (const viewId of this.selection.keys()) this.pruneSelection(viewId);
    for (const viewId of changedViewIds) {
      this.pruneSelection(viewId);
      this.emit('changed', viewId);
    }
  }

  project(viewId: string): CanvasProjection {
    const view = this.model.views.find((item) => item.id === viewId);
    if (!view) invalid();
    return { viewId, nodes: nodesOf(view.nodes, this.model.elements), connections: view.connections.map((item) => {
      const relationship = this.model.relationships.find((candidate) => candidate.id === item.relationshipId);
      return {
        id: item.id, waypoints: structuredClone(item.waypoints),
        ...(item.sourceId !== undefined ? { sourceId: item.sourceId } : {}),
        ...(item.targetId !== undefined ? { targetId: item.targetId } : {}),
        ...(item.relationshipId !== undefined ? { relationshipId: item.relationshipId } : {}),
        ...(relationship?.type !== undefined ? { type: relationship.type } : {}),
        ...(relationship?.name !== undefined ? { name: relationship.name } : {}),
        ...(item.label !== undefined ? { label: item.label } : {}),
        ...(item.style !== undefined ? { style: structuredClone(item.style) } : {})
      };
    }), selectedIds: [...(this.selection.get(viewId) || [])] };
  }

  subscribe(listener: (event: EditorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A UI port translates native canvas events to ID-only commands and selection. */
  attach(viewId: string, port: CanvasPort): () => void {
    if (this.canvases.size || this.canvases.has(port)) invalid();
    port.render(this.project(viewId));
    const binding: AttachedCanvas = { viewId, offCommand: () => {}, offSelection: () => {} };
    const offCommand = port.onCommand((command) => {
      if (command.viewId !== binding.viewId) invalid();
      this.execute(command);
    });
    binding.offCommand = offCommand;
    try { binding.offSelection = port.onSelection((ids) => { this.select(binding.viewId, ids); }); }
    catch (error) { offCommand(); port.clear?.(); throw error; }
    this.canvases.set(port, binding);
    return () => this.detach(port, binding);
  }

  switchAttachedView(port: CanvasPort, viewId: string): CanvasProjection {
    const binding = this.canvases.get(port);
    if (!binding) invalid();
    const previousProjection = this.project(binding.viewId);
    const projection = this.project(viewId);
    const previousViewId = binding.viewId;
    binding.viewId = viewId;
    try { port.render(projection); }
    catch (error) { binding.viewId = previousViewId; port.render(previousProjection); throw error; }
    return projection;
  }

  select(viewId: string, ids: string[]): void {
    const projection = this.project(viewId);
    const available = new Set([...projection.nodes, ...projection.connections].map((item) => item.id));
    if (!Array.isArray(ids) || ids.some((id) => !available.has(id))) invalid();
    this.selection.set(viewId, [...new Set(ids)]);
    this.emit('selection', viewId);
  }

  execute(command: EditorCommand): void {
    const safeCommand = commandForExecution(command);
    const operation = this.prepareOperation('command', safeCommand);
    const next = apply(this.model, safeCommand, this.semanticProfile);
    this.past.push({ model: this.model, viewId: safeCommand.viewId });
    this.model = next;
    this.future = [];
    this.commitOperation(operation);
    this.pruneSelection(safeCommand.viewId);
    this.emit('changed', safeCommand.viewId);
  }

  undo(): boolean {
    const previous = this.past.at(-1);
    if (!previous) return false;
    const operation = this.prepareOperation('undo');
    this.past.pop();
    this.future.push({ model: this.model, viewId: previous.viewId });
    this.model = previous.model;
    this.commitOperation(operation);
    this.pruneSelection(previous.viewId);
    this.emit('changed', previous.viewId);
    return true;
  }

  redo(): boolean {
    const next = this.future.at(-1);
    if (!next) return false;
    const operation = this.prepareOperation('redo');
    this.future.pop();
    this.past.push({ model: this.model, viewId: next.viewId });
    this.model = next.model;
    this.commitOperation(operation);
    this.pruneSelection(next.viewId);
    this.emit('changed', next.viewId);
    return true;
  }

  private prepareOperation(action: EditorOperationAction,
    command?: EditorCommand): Pick<EditorOperation, 'action' | 'command'> {
    if (this.operationSequence >= MAX_EDITOR_OPERATIONS) {
      throw new EditorOperationLogError('EDITOR_OPERATION_SEQUENCE_INVALID');
    }
    return action === 'command' ?
      { action, command: validateEditorCommand(command) } : { action };
  }

  private commitOperation(operation: Pick<EditorOperation, 'action' | 'command'>): void {
    this.operations.push(operation);
    this.operationSequence += 1;
  }

  private replayOperation(candidate: DiagramAdapter, entry: EditorOperation): void {
    if (entry.action === 'command') {
      try { candidate.execute(entry.command!); }
      catch (error) {
        if (error instanceof TypeError) {
          throw new EditorOperationLogError('EDITOR_OPERATION_COMMAND_REJECTED');
        }
        throw error;
      }
      return;
    }
    const changed = entry.action === 'undo' ? candidate.undo() : candidate.redo();
    if (!changed) throw new EditorOperationLogError('EDITOR_OPERATION_COMMAND_REJECTED');
  }

  private pruneSelection(viewId: string): void {
    const projection = this.project(viewId);
    const available = new Set([...projection.nodes, ...projection.connections].map((item) => item.id));
    this.selection.set(viewId, (this.selection.get(viewId) || []).filter((id) => available.has(id)));
  }

  private emit(type: EditorEvent['type'], viewId: string): void {
    for (const [port, binding] of this.canvases) if (binding.viewId === viewId) {
      port.render(this.project(viewId));
    }
    for (const listener of this.listeners) listener({ type, viewId,
      model: this.getModel(), selectedIds: [...(this.selection.get(viewId) || [])] });
  }

  private detach(port: CanvasPort, binding: AttachedCanvas): void {
    binding.offCommand(); binding.offSelection(); this.canvases.delete(port); port.clear?.();
  }
}
