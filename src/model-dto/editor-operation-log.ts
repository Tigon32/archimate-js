import type { EditorCommand } from './editor.js';
import { isIdentifier } from './validate.js';

export type EditorOperationAction = 'command' | 'undo' | 'redo';

export interface EditorOperation {
  sequence: number;
  operationId: string;
  action: EditorOperationAction;
  command?: EditorCommand;
}

export interface EditorOperationLog {
  schemaVersion: 1;
  clientId: string;
  operations: EditorOperation[];
}

export type EditorOperationLogErrorCode =
  | 'EDITOR_OPERATION_LOG_INVALID'
  | 'EDITOR_OPERATION_VERSION_UNSUPPORTED'
  | 'EDITOR_OPERATION_SEQUENCE_INVALID'
  | 'EDITOR_OPERATION_ID_INVALID'
  | 'EDITOR_OPERATION_ID_DUPLICATE'
  | 'EDITOR_OPERATION_CLIENT_ID_INVALID'
  | 'EDITOR_OPERATION_COMMAND_REJECTED'
  | 'EDITOR_OPERATION_REPLAY_NOT_FRESH';

const MAX_LOG_LENGTH = 10_000_000;
export const MAX_EDITOR_OPERATIONS = 100_000;
const MAX_OPERATIONS = MAX_EDITOR_OPERATIONS;
type CloneBudget = { used: number };

const COMMAND_FIELDS: Record<string, { required: string[]; optional?: string[] }> = {
  'create-element': { required: ['type', 'viewId', 'element', 'node'] },
  'create-relationship': { required: ['type', 'viewId', 'relationship', 'connection'] },
  move: { required: ['type', 'viewId', 'nodeId', 'x', 'y'] },
  'move-many': { required: ['type', 'viewId', 'moves'] },
  resize: { required: ['type', 'viewId', 'nodeId', 'x', 'y', 'width', 'height'] },
  connect: { required: ['type', 'viewId', 'connection'], optional: ['relationship'] },
  reconnect: { required: ['type', 'viewId', 'connectionId', 'waypoints'],
    optional: ['sourceId', 'targetId'] },
  delete: { required: ['type', 'viewId', 'itemId'] },
  'delete-many': { required: ['type', 'viewId', 'itemIds'] },
  'apply-layout-patch': { required: ['type', 'viewId', 'patch', 'side'] },
  label: { required: ['type', 'viewId', 'itemId', 'label'] },
  'concept-name': { required: ['type', 'viewId', 'conceptId'], optional: ['name'] },
  'concept-documentation': { required: ['type', 'viewId', 'conceptId'],
    optional: ['documentation'] },
  property: { required: ['type', 'viewId', 'conceptId', 'propertyDefinitionId', 'values'] }
};

export class EditorOperationLogError extends TypeError {
  constructor(readonly code: EditorOperationLogErrorCode) {
    super(code);
    this.name = 'EditorOperationLogError';
  }
}

function reject(code: EditorOperationLogErrorCode = 'EDITOR_OPERATION_LOG_INVALID'): never {
  throw new EditorOperationLogError(code);
}

function cloneJson(value: unknown, seen = new Set<object>(), depth = 0,
  budget: CloneBudget = { used: 0 }): unknown {
  if (depth > 64) reject();
  if (typeof value === 'string') {
    budget.used += value.length;
    if (budget.used > MAX_LOG_LENGTH) reject();
    return value;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : value;
  if (!value || typeof value !== 'object' || seen.has(value)) reject();
  seen.add(value);
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    if (value.length > MAX_OPERATIONS || keys.length !== value.length + 1 ||
        keys.some((key) => typeof key !== 'string')) reject();
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !('value' in descriptor)) reject();
      result.push(cloneJson(descriptor.value, seen, depth + 1, budget));
    }
    seen.delete(value);
    return result;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) reject();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) reject();
  const result: Record<string, unknown> = {};
  for (const key of (keys as string[]).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) reject();
    if (descriptor.value === undefined) continue;
    budget.used += key.length;
    if (budget.used > MAX_LOG_LENGTH) reject();
    Object.defineProperty(result, key, { value: cloneJson(descriptor.value, seen, depth + 1, budget),
      enumerable: true, writable: true, configurable: true });
  }
  seen.delete(value);
  return result;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], required: string[]): void {
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !keys.includes(key))) reject();
}

function stringValue(value: unknown): void {
  if (typeof value !== 'string') reject();
}

function numberValue(value: unknown, positive = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || positive && value <= 0) reject();
}

function stylePayload(value: unknown): void {
  if (value === undefined) return;
  const style = object(value);
  exactKeys(style, ['fill', 'stroke', 'lineWidth'], []);
  for (const key of ['fill', 'stroke']) if (style[key] !== undefined) stringValue(style[key]);
  if (style.lineWidth !== undefined) numberValue(style.lineWidth, true);
}

function pointPayload(value: unknown): void {
  const point = object(value);
  exactKeys(point, ['x', 'y', 'kind'], ['x', 'y']);
  numberValue(point.x);
  numberValue(point.y);
  if (point.kind !== undefined && !['sourceAttachment', 'bendpoint', 'targetAttachment'].includes(
    String(point.kind))) reject();
}

function propertyPayload(value: unknown): void {
  const property = object(value);
  exactKeys(property, ['propertyDefinitionId', 'values'], ['propertyDefinitionId', 'values']);
  stringValue(property.propertyDefinitionId);
  if (!Array.isArray(property.values) || !property.values.length) reject();
  for (const valueItem of property.values) {
    const item = object(valueItem);
    exactKeys(item, ['language', 'value'], ['value']);
    stringValue(item.value);
    if (item.language !== undefined) stringValue(item.language);
  }
}

function elementPayload(value: unknown, relationship = false): void {
  const data = object(value);
  const extra = relationship ? ['sourceId', 'targetId'] : [];
  exactKeys(data, ['id', 'type', 'name', 'documentation', 'properties', ...extra],
    ['id', 'type', ...(relationship ? extra : [])]);
  stringValue(data.id);
  stringValue(data.type);
  for (const key of ['name', 'documentation', ...extra]) {
    if (data[key] !== undefined) stringValue(data[key]);
  }
  if (data.properties !== undefined) {
    if (!Array.isArray(data.properties) || !data.properties.length) reject();
    for (const property of data.properties) propertyPayload(property);
  }
}

function nodePayload(value: unknown, depth = 0): void {
  if (depth > 64) reject();
  const node = object(value);
  exactKeys(node, ['id', 'kind', 'elementId', 'conceptRef', 'xpathPart', 'x', 'y',
    'width', 'height', 'label', 'style', 'nodes'], ['id', 'kind', 'x', 'y', 'width', 'height', 'nodes']);
  stringValue(node.id);
  if (!['element', 'container', 'label'].includes(String(node.kind))) reject();
  if (node.kind === 'element') stringValue(node.elementId);
  else if (node.elementId !== undefined) reject();
  for (const key of ['conceptRef', 'xpathPart', 'label']) {
    if (node[key] !== undefined) stringValue(node[key]);
  }
  for (const key of ['x', 'y', 'width', 'height']) numberValue(node[key], key === 'width' || key === 'height');
  stylePayload(node.style);
  if (!Array.isArray(node.nodes)) reject();
  node.nodes.forEach((child) => nodePayload(child, depth + 1));
}

function connectionPayload(value: unknown): void {
  const connection = object(value);
  exactKeys(connection, ['id', 'kind', 'relationshipId', 'sourceId', 'targetId',
    'waypoints', 'label', 'style'], ['id', 'kind', 'waypoints']);
  stringValue(connection.id);
  if (connection.kind !== 'line' && connection.kind !== 'relationship') reject();
  for (const key of ['relationshipId', 'sourceId', 'targetId', 'label']) {
    if (connection[key] !== undefined) stringValue(connection[key]);
  }
  if (connection.kind === 'relationship') {
    for (const key of ['relationshipId', 'sourceId', 'targetId']) stringValue(connection[key]);
  }
  if (!Array.isArray(connection.waypoints) || connection.waypoints.length < 2) reject();
  connection.waypoints.forEach(pointPayload);
  stylePayload(connection.style);
}

function geometryPayload(value: unknown): void {
  const geometry = object(value);
  exactKeys(geometry, ['x', 'y', 'width', 'height'], ['x', 'y', 'width', 'height']);
  numberValue(geometry.x);
  numberValue(geometry.y);
  numberValue(geometry.width, true);
  numberValue(geometry.height, true);
}

function validatePatchShape(value: unknown): void {
  const patch = object(value);
  exactKeys(patch, ['viewId', 'nodes', 'connections'], ['viewId', 'nodes', 'connections']);
  stringValue(patch.viewId);
  for (const item of [patch.nodes, patch.connections]) {
    if (!Array.isArray(item)) reject();
  }
  for (const item of patch.nodes as unknown[]) {
    const entry = object(item);
    exactKeys(entry, ['id', 'before', 'after'], ['id', 'before', 'after']);
    stringValue(entry.id);
    geometryPayload(entry.before);
    geometryPayload(entry.after);
  }
  for (const item of patch.connections as unknown[]) {
    const entry = object(item);
    exactKeys(entry, ['id', 'before', 'after'], ['id', 'before', 'after']);
    stringValue(entry.id);
    for (const points of [entry.before, entry.after]) {
      if (!Array.isArray(points)) reject();
      if (points.length < 2) reject();
      for (const point of points) {
        pointPayload(point);
      }
    }
  }
}

function validateCreateCommand(command: Record<string, unknown>): void {
  if (command.type === 'create-element') {
    elementPayload(command.element);
    nodePayload(command.node);
  } else if (command.type === 'create-relationship') {
    elementPayload(command.relationship, true);
    connectionPayload(command.connection);
  } else reject();
}

function validateConnectionCommand(command: Record<string, unknown>): void {
  if (command.type === 'connect') {
    connectionPayload(command.connection);
    if (command.relationship !== undefined) elementPayload(command.relationship, true);
  } else if (command.type === 'reconnect') {
    stringValue(command.connectionId);
    if (command.sourceId !== undefined) stringValue(command.sourceId);
    if (command.targetId !== undefined) stringValue(command.targetId);
    if (!Array.isArray(command.waypoints) || command.waypoints.length < 2) reject();
    command.waypoints.forEach(pointPayload);
  } else reject();
}

function validateGeometryCommand(command: Record<string, unknown>): void {
  if (command.type === 'move') {
    stringValue(command.nodeId);
    numberValue(command.x);
    numberValue(command.y);
  } else if (command.type === 'move-many') {
    if (!Array.isArray(command.moves)) reject();
    for (const move of command.moves) {
      const item = object(move);
      exactKeys(item, ['nodeId', 'x', 'y'], ['nodeId', 'x', 'y']);
      stringValue(item.nodeId);
      numberValue(item.x);
      numberValue(item.y);
    }
  } else if (command.type === 'resize') {
    stringValue(command.nodeId);
    numberValue(command.x);
    numberValue(command.y);
    numberValue(command.width, true);
    numberValue(command.height, true);
  } else if (command.type === 'apply-layout-patch') {
    validatePatchShape(command.patch);
    if (command.side !== 'after' && command.side !== 'before') reject();
  } else reject();
}

function validateSimpleCommand(command: Record<string, unknown>): void {
  switch (command.type) {
  case 'delete':
    stringValue(command.itemId);
    break;
  case 'delete-many':
    if (!Array.isArray(command.itemIds)) reject();
    command.itemIds.forEach(stringValue);
    break;
  case 'label':
    stringValue(command.itemId);
    stringValue(command.label);
    break;
  case 'concept-name':
  case 'concept-documentation':
    stringValue(command.conceptId);
    if (command.name !== undefined) stringValue(command.name);
    if (command.documentation !== undefined) stringValue(command.documentation);
    break;
  case 'property':
    stringValue(command.conceptId);
    stringValue(command.propertyDefinitionId);
    if (!Array.isArray(command.values)) reject();
    command.values.forEach((item) => {
      const value = object(item);
      exactKeys(value, ['language', 'value'], ['value']);
      stringValue(value.value);
      if (value.language !== undefined) stringValue(value.language);
    });
    break;
  default:
    reject();
  }
}

function validateCommandPayload(command: Record<string, unknown>): void {
  if (command.type === 'create-element' || command.type === 'create-relationship') {
    validateCreateCommand(command);
  } else if (command.type === 'connect' || command.type === 'reconnect') {
    validateConnectionCommand(command);
  } else if (['move', 'move-many', 'resize', 'apply-layout-patch'].includes(String(command.type))) {
    validateGeometryCommand(command);
  } else {
    validateSimpleCommand(command);
  }
}

export function validateEditorCommand(input: unknown): EditorCommand {
  const command = object(cloneJson(input));
  const type = command.type;
  const fields = typeof type === 'string' && Object.hasOwn(COMMAND_FIELDS, type) ?
    COMMAND_FIELDS[type] : undefined;
  if (!fields || typeof command.viewId !== 'string') reject();
  exactKeys(command, [...fields.required, ...(fields.optional || [])], fields.required);
  validateCommandPayload(command);
  return command as EditorCommand;
}

function operation(input: unknown, index: number, clientId: string,
  ids: Set<string>): EditorOperation {
  const source = object(input);
  const action = source.action;
  const keys = action === 'command' ?
    ['sequence', 'operationId', 'action', 'command'] : ['sequence', 'operationId', 'action'];
  exactKeys(source, keys, keys);
  const sequence = index + 1;
  if (!Number.isSafeInteger(source.sequence) || source.sequence !== sequence) {
    reject('EDITOR_OPERATION_SEQUENCE_INVALID');
  }
  if (typeof source.operationId !== 'string') reject('EDITOR_OPERATION_ID_INVALID');
  if (ids.has(source.operationId)) reject('EDITOR_OPERATION_ID_DUPLICATE');
  ids.add(source.operationId);
  if (source.operationId !== `${clientId}:${sequence}`) reject('EDITOR_OPERATION_ID_INVALID');
  if (action !== 'command' && action !== 'undo' && action !== 'redo') reject();
  return action === 'command' ?
    { sequence, operationId: source.operationId, action, command: validateEditorCommand(source.command) } :
    { sequence, operationId: source.operationId, action };
}

export function validateOperationLog(input: unknown): EditorOperationLog {
  const data = object(cloneJson(input));
  exactKeys(data, ['schemaVersion', 'clientId', 'operations'],
    ['schemaVersion', 'clientId', 'operations']);
  if (data.schemaVersion !== 1) reject('EDITOR_OPERATION_VERSION_UNSUPPORTED');
  const clientId = data.clientId;
  if (typeof clientId !== 'string' || !isIdentifier(clientId)) {
    reject('EDITOR_OPERATION_CLIENT_ID_INVALID');
  }
  if (!Array.isArray(data.operations) || data.operations.length > MAX_OPERATIONS) reject();
  const ids = new Set<string>();
  return { schemaVersion: 1, clientId,
    operations: data.operations.map((item, index) => operation(item, index, clientId, ids)) };
}

export function buildOperationLog(clientId: string,
  entries: readonly Pick<EditorOperation, 'action' | 'command'>[]): EditorOperationLog {
  if (!isIdentifier(clientId)) reject('EDITOR_OPERATION_CLIENT_ID_INVALID');
  if (entries.length > MAX_OPERATIONS) reject('EDITOR_OPERATION_SEQUENCE_INVALID');
  const operations = entries.map((entry, index) => {
    const sequence = index + 1;
    return entry.action === 'command' ?
      { sequence, operationId: `${clientId}:${sequence}`, action: entry.action,
        command: validateEditorCommand(entry.command) } :
      { sequence, operationId: `${clientId}:${sequence}`, action: entry.action };
  });
  return { schemaVersion: 1, clientId, operations };
}

export function serializeOperationLog(input: unknown): string {
  const json = JSON.stringify(validateOperationLog(input));
  if (json.length > MAX_LOG_LENGTH) reject();
  return json;
}

export function parseOperationLog(json: unknown): EditorOperationLog {
  if (typeof json !== 'string' || json.length > MAX_LOG_LENGTH) reject();
  let value: unknown;
  try { value = JSON.parse(json); }
  catch (error) {
    if (error instanceof SyntaxError) reject();
    throw error;
  }
  return validateOperationLog(value);
}
