import { resolveConcept } from '../language/concept-registry.mjs';
import { validateRelationshipSemantics } from '../language/relationship-semantics.mjs';
import type { ElementDto, ModelDto, RelationshipDto, ViewConnectionDto, ViewNodeDto } from './types.js';
import { exportModelDtoToMeff } from './meff-export.js';
import { EditorCommandError } from './editor-view.js';
import { rejectRelationshipEdit } from './editor-diagnostics.js';
import type { EditorCommand } from './editor.js';
import { findNode } from './editor-view.js';
import { validateModelDto } from './validate.js';

const RELATIONSHIP_TYPES = new Set([
  'Access', 'Aggregation', 'Assignment', 'Association', 'Composition',
  'Flow', 'Influence', 'Realization', 'Serving', 'Specialization', 'Triggering'
]);

type CreateElementCommand = Extract<EditorCommand, { type: 'create-element' }>;
type CreateRelationshipCommand = Extract<EditorCommand, { type: 'create-relationship' }>;

function localType(type: string): string {
  const name = type.lastIndexOf(':') === -1 ? type : type.slice(type.lastIndexOf(':') + 1);
  return name.replace(/Relationship$/, '');
}

function reject(code: ConstructorParameters<typeof EditorCommandError>[0]): never {
  throw new EditorCommandError(code);
}

function allObjectIds(model: ModelDto): Set<string> {
  const ids = new Set([model.id, ...model.elements.map((item) => item.id),
    ...model.relationships.map((item) => item.id), ...model.views.map((item) => item.id),
    ...(model.propertyDefinitions || []).map((item) => item.id)]);
  for (const view of model.views) {
    const visit = (node: ViewNodeDto): void => {
      ids.add(node.id);
      node.nodes.forEach(visit);
    };
    view.nodes.forEach(visit);
    view.connections.forEach((connection) => ids.add(connection.id));
  }
  return ids;
}

function sameData(source: unknown, target: unknown): boolean {
  if (Object.is(source, target)) return true;
  if (Array.isArray(source) || Array.isArray(target)) {
    return Array.isArray(source) && Array.isArray(target) && source.length === target.length &&
      source.every((item, index) => sameData(item, target[index]));
  }
  if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return false;
  const left = source as Record<string, unknown>;
  const right = target as Record<string, unknown>;
  const keys = Reflect.ownKeys(left).filter((key) => left[key as string] !== undefined);
  const expected = Reflect.ownKeys(right).filter((key) => right[key as string] !== undefined);
  return keys.length === expected.length && keys.every((key) =>
    Reflect.has(right, key) && sameData(left[key as string], right[key as string]));
}

function validateCandidate(model: ModelDto, code: ConstructorParameters<typeof EditorCommandError>[0]): ModelDto {
  try {
    const validated = validateModelDto(model);
    if (!sameData(model, validated)) reject(code);
    exportModelDtoToMeff(validated);
    return validated;
  } catch (error) {
    if (error instanceof EditorCommandError) throw error;
    reject(code);
  }
}

function validateElement(element: ElementDto): void {
  if (!resolveConcept(element.type)) reject('DTO_CREATE_INVALID_ELEMENT');
}

function validateNewElement(model: ModelDto, command: CreateElementCommand): ModelDto {
  const view = model.views.find((item) => item.id === command.viewId);
  if (!view) reject('DTO_CREATE_VIEW_NOT_FOUND');
  validateElement(command.element);
  if (allObjectIds(model).has(command.element.id)) reject('DTO_CREATE_DUPLICATE_ID');
  if (command.node.kind !== 'element' || command.node.elementId !== command.element.id ||
      command.node.conceptRef !== undefined || command.node.xpathPart !== undefined) {
    reject('DTO_CREATE_INVALID_ELEMENT');
  }
  if (allObjectIds(model).has(command.node.id)) reject('DTO_CREATE_NODE_ID_CONFLICT');
  const candidate = structuredClone(model);
  candidate.elements.push(structuredClone(command.element));
  candidate.views.find((item) => item.id === command.viewId)!.nodes.push(structuredClone(command.node));
  return validateCandidate(candidate, 'DTO_CREATE_INVALID_ELEMENT');
}

function validateRelationshipType(type: string): void {
  if (typeof type !== 'string' || !RELATIONSHIP_TYPES.has(localType(type))) {
    reject('DTO_CREATE_INVALID_RELATIONSHIP');
  }
}

function validateRelationshipEndpoints(model: ModelDto, viewId: string,
  relationship: RelationshipDto, connection: ViewConnectionDto): void {
  const view = model.views.find((item) => item.id === viewId);
  if (!view) reject('DTO_CREATE_VIEW_NOT_FOUND');
  const source = findNode(view.nodes, connection.sourceId!);
  const target = findNode(view.nodes, connection.targetId!);
  if (!source || !target || source.kind !== 'element' || target.kind !== 'element' ||
      source.elementId !== relationship.sourceId || target.elementId !== relationship.targetId) {
    reject('DTO_CREATE_ENDPOINT_INVALID');
  }
  const sourceElement = model.elements.find((item) => item.id === relationship.sourceId);
  const targetElement = model.elements.find((item) => item.id === relationship.targetId);
  if (!sourceElement || !targetElement) reject('DTO_CREATE_ENDPOINT_INVALID');
  const decision = validateRelationshipSemantics({
    sourceType: sourceElement.type, relationshipType: relationship.type, targetType: targetElement.type
  });
  if (decision.decision !== 'allowed') {
    rejectRelationshipEdit(decision.decision === 'disallowed' ?
      'DTO_RELATIONSHIP_DISALLOWED' : 'DTO_RELATIONSHIP_UNSUPPORTED', 'connect', {
        viewId, connectionId: connection.id, relationshipId: relationship.id,
        sourceId: connection.sourceId, targetId: connection.targetId,
        sourceElementId: relationship.sourceId, targetElementId: relationship.targetId
      });
  }
}

function validateNewRelationship(model: ModelDto, command: CreateRelationshipCommand): ModelDto {
  const { relationship, connection } = command;
  validateRelationshipType(relationship.type);
  if (connection.kind !== 'relationship' || connection.relationshipId !== relationship.id) {
    reject('DTO_CREATE_INVALID_RELATIONSHIP');
  }
  if (allObjectIds(model).has(relationship.id)) reject('DTO_CREATE_DUPLICATE_ID');
  if (allObjectIds(model).has(connection.id)) reject('DTO_CREATE_CONNECTION_ID_CONFLICT');
  validateRelationshipEndpoints(model, command.viewId, relationship, connection);
  const candidate = structuredClone(model);
  candidate.relationships.push(structuredClone(relationship));
  candidate.views.find((item) => item.id === command.viewId)!.connections.push(structuredClone(connection));
  return validateCandidate(candidate, 'DTO_CREATE_INVALID_RELATIONSHIP');
}

export function createElement(model: ModelDto, command: CreateElementCommand): ModelDto {
  return validateNewElement(model, command);
}

export function createRelationship(model: ModelDto, command: CreateRelationshipCommand): ModelDto {
  return validateNewRelationship(model, command);
}
