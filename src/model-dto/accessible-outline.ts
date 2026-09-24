import { validateModelDto } from './validate.js';
import type { ElementDto, ModelDto, RelationshipDto, ViewConnectionDto, ViewNodeDto } from './types.js';

export interface AccessibleOutlineOptions {
  grouping?: 'containment' | 'flat';
  includeRelationships?: boolean;
  includeDocumentation?: boolean;
}

export interface AccessibleOutlineNode {
  id: string;
  kind: ViewNodeDto['kind'];
  type: string;
  name: string;
  children: AccessibleOutlineNode[];
  incomingConnectionIds: string[];
  outgoingConnectionIds: string[];
  documentation?: string;
}

export interface AccessibleOutlineRelationship {
  id: string;
  kind: 'relationship' | 'line';
  type: string;
  name: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  documentation?: string;
}

export interface AccessibleOutline {
  viewId: string;
  viewName: string;
  grouping: 'containment' | 'flat';
  nodes: AccessibleOutlineNode[];
  relationships: AccessibleOutlineRelationship[];
}

function failure(code: string, message: string): never {
  throw Object.assign(new TypeError(message), { code });
}

function visibleName(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function plainType(type: string): string {
  return type.replace(/^archimate:/, '');
}

function optionsOf(value: AccessibleOutlineOptions | undefined): Required<AccessibleOutlineOptions> {
  if (value === undefined) return {
    grouping: 'containment', includeRelationships: true, includeDocumentation: false
  };
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.grouping !== undefined && value.grouping !== 'containment' && value.grouping !== 'flat' ||
      value.includeRelationships !== undefined && typeof value.includeRelationships !== 'boolean' ||
      value.includeDocumentation !== undefined && typeof value.includeDocumentation !== 'boolean') {
    failure('ACCESSIBLE_OUTLINE_INVALID', 'The accessible outline options are invalid.');
  }
  return { grouping: value.grouping ?? 'containment',
    includeRelationships: value.includeRelationships ?? true,
    includeDocumentation: value.includeDocumentation ?? false };
}

function describeNodes(sources: ViewNodeDto[], elements: Map<string, ElementDto>,
  includeDocumentation: boolean): { nested: AccessibleOutlineNode[];
  all: AccessibleOutlineNode[]; byId: Map<string, AccessibleOutlineNode> } {
  const byId = new Map<string, AccessibleOutlineNode>();
  const all: AccessibleOutlineNode[] = [];
  const makeNode = (source: ViewNodeDto): AccessibleOutlineNode => {
    const concept = source.elementId ? elements.get(source.elementId) : undefined;
    const type = concept ? plainType(concept.type) : source.kind === 'container' ? 'Group' : 'Label';
    const node: AccessibleOutlineNode = {
      id: source.id, kind: source.kind, type,
      name: visibleName(source.label) ?? visibleName(concept?.name) ?? `Unnamed ${type}`,
      children: [], incomingConnectionIds: [], outgoingConnectionIds: []
    };
    if (includeDocumentation && concept?.documentation !== undefined) node.documentation = concept.documentation;
    byId.set(node.id, node);
    all.push(node);
    node.children = source.nodes.map(makeNode);
    return node;
  };
  return { nested: sources.map(makeNode), all, byId };
}

function describeConnection(connection: ViewConnectionDto, concept: RelationshipDto | undefined,
  nodes: Map<string, AccessibleOutlineNode>, includeDocumentation: boolean): AccessibleOutlineRelationship {
  const type = concept ? plainType(concept.type) : 'Line';
  const source = connection.sourceId ? nodes.get(connection.sourceId) : undefined;
  const target = connection.targetId ? nodes.get(connection.targetId) : undefined;
  const described: AccessibleOutlineRelationship = {
    id: connection.id, kind: connection.kind, type,
    name: visibleName(connection.label) ?? visibleName(concept?.name) ??
      `${type} from ${source?.name ?? 'unknown node'} to ${target?.name ?? 'unknown node'}`
  };
  if (connection.sourceId) described.sourceNodeId = connection.sourceId;
  if (connection.targetId) described.targetNodeId = connection.targetId;
  if (includeDocumentation && concept?.documentation !== undefined) described.documentation = concept.documentation;
  if (source) source.outgoingConnectionIds.push(connection.id);
  if (target) target.incomingConnectionIds.push(connection.id);
  return described;
}

/** Build a detached, deterministic description of one view; no renderer is needed. */
export function createAccessibleOutline(model: unknown, viewId: string,
  options?: AccessibleOutlineOptions): AccessibleOutline {
  const config = optionsOf(options);
  const dto = validateModelDto(model);
  if (typeof viewId !== 'string') failure('ACCESSIBLE_OUTLINE_VIEW_NOT_FOUND', 'The requested view is unavailable.');
  const view = dto.views.find((item) => item.id === viewId);
  if (!view) failure('ACCESSIBLE_OUTLINE_VIEW_NOT_FOUND', 'The requested view is unavailable.');

  const nodes = describeNodes(view.nodes,
    new Map(dto.elements.map((element) => [element.id, element])), config.includeDocumentation);
  const relationships = config.includeRelationships ? describeRelationships(view.connections, dto,
    nodes.byId, config.includeDocumentation) : [];

  // Flat output preserves preorder and has no duplicate child objects.
  return { viewId: view.id, viewName: visibleName(view.name) ?? 'Unnamed view',
    grouping: config.grouping,
    nodes: config.grouping === 'flat' ? nodes.all.map((node) => ({ ...node, children: [] })) : nodes.nested,
    relationships };
}

function describeRelationships(connections: ViewConnectionDto[], dto: ModelDto,
  nodes: Map<string, AccessibleOutlineNode>, includeDocumentation: boolean): AccessibleOutlineRelationship[] {
  const relationships = new Map(dto.relationships.map((relation) => [relation.id, relation]));
  return connections.map((connection) => describeConnection(connection,
    connection.relationshipId ? relationships.get(connection.relationshipId) : undefined,
    nodes, includeDocumentation));
}

function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').trim();
}

/** Format the outline as plain text for a report or an accessible fallback. */
export function formatAccessibleOutline(outline: AccessibleOutline): string {
  if (!outline || typeof outline !== 'object' || !Array.isArray(outline.nodes) ||
      !Array.isArray(outline.relationships) || typeof outline.viewName !== 'string') {
    failure('ACCESSIBLE_OUTLINE_INVALID', 'The accessible outline is invalid.');
  }
  const lines = [`View: ${oneLine(outline.viewName)}`];
  const renderNode = (node: AccessibleOutlineNode, depth: number): void => {
    lines.push(`${'  '.repeat(depth)}- ${oneLine(node.type)}: ${oneLine(node.name)} [${oneLine(node.id)}]`);
    if (node.documentation !== undefined) lines.push(`${'  '.repeat(depth + 1)}${oneLine(node.documentation)}`);
    node.children.forEach((child) => renderNode(child, depth + 1));
  };
  outline.nodes.forEach((node) => renderNode(node, 0));
  if (outline.relationships.length) {
    lines.push('Connections:');
    for (const connection of outline.relationships) {
      lines.push(`- ${oneLine(connection.name)} [${oneLine(connection.id)}]`);
      if (connection.documentation !== undefined) lines.push(`  ${oneLine(connection.documentation)}`);
    }
  }
  return lines.join('\n');
}
