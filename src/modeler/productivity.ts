import type { CanvasProjection, EditorCommand } from '../model-dto/editor.js';
import type {
  ElementDto, ModelDto, RelationshipDto, ViewConnectionDto, ViewNodeDto
} from '../model-dto/types.js';
import { invalid } from '../model-dto/validate.js';

export type Alignment =
  | 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributionAxis = 'horizontal' | 'vertical';
export type IdFactory = (kind: string) => string;

type DuplicateCommand = Extract<EditorCommand, { type: 'duplicate-selection' }>;

function selectedNodes(projection: CanvasProjection): CanvasProjection['nodes'] {
  const selected = new Set(projection.selectedIds);
  return projection.nodes.filter((node) => selected.has(node.id) && node.kind === 'element');
}

function cloneElement(element: ElementDto, id: string): ElementDto {
  return { ...structuredClone(element), id };
}

function cloneRelationship(relationship: RelationshipDto, id: string,
  elementIds: Map<string, string>): RelationshipDto {
  return {
    ...structuredClone(relationship),
    id,
    sourceId: elementIds.get(relationship.sourceId)!,
    targetId: elementIds.get(relationship.targetId)!
  };
}

function duplicateConnections(model: ModelDto, view: ModelDto['views'][number],
  nodeIds: Map<string, string>, elementIds: Map<string, string>, createId: IdFactory,
  offset: { x: number; y: number }): Pick<DuplicateCommand, 'relationships' | 'connections'> {
  const sourceConnections = view.connections.filter((connection) =>
    nodeIds.has(connection.sourceId || '') && nodeIds.has(connection.targetId || '') &&
    connection.relationshipId);
  const relationshipIds = new Map<string, string>();
  for (const connection of sourceConnections) if (!relationshipIds.has(connection.relationshipId!)) {
    relationshipIds.set(connection.relationshipId!, createId('relationship'));
  }
  const relationships = [...relationshipIds].map(([oldId, id]) => {
    const relationship = model.relationships.find((item) => item.id === oldId);
    if (!relationship || !elementIds.has(relationship.sourceId) ||
        !elementIds.has(relationship.targetId)) invalid();
    return cloneRelationship(relationship, id, elementIds);
  });
  const connections = sourceConnections.map((connection): ViewConnectionDto => ({
    id: createId('connection'), kind: 'relationship',
    relationshipId: relationshipIds.get(connection.relationshipId!)!,
    sourceId: nodeIds.get(connection.sourceId!)!,
    targetId: nodeIds.get(connection.targetId!)!,
    waypoints: connection.waypoints.map((point) =>
      ({ ...point, x: point.x + offset.x, y: point.y + offset.y })),
    ...(connection.label !== undefined ? { label: connection.label } : {}),
    ...(connection.style !== undefined ? { style: structuredClone(connection.style) } : {})
  }));
  return { relationships, connections };
}

function hasUnsupportedSelection(projection: CanvasProjection, selected: Set<string>): boolean {
  const parents = new Map(projection.nodes.map((node) => [node.id, node.parentId]));
  return projection.nodes.some((node) => {
    if (node.kind === 'element') return false;
    const visited = new Set<string>();
    let current: string | undefined = node.id;
    while (current && !visited.has(current)) {
      if (selected.has(current)) return true;
      visited.add(current);
      current = parents.get(current);
    }
    return false;
  });
}

export function duplicateSelectionCommand(model: ModelDto, projection: CanvasProjection,
  createId: IdFactory, offset = { x: 20, y: 20 }): DuplicateCommand | undefined {
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) invalid();
  const view = model.views.find((item) => item.id === projection.viewId);
  if (!view) invalid();
  const selected = new Set(projection.selectedIds);
  if (hasUnsupportedSelection(projection, selected)) return undefined;
  const sourceNodes: Array<{ node: ViewNodeDto; parentId?: string }> = [];
  let unsupported = false;
  const visit = (node: ViewNodeDto, parentId?: string, selectedAncestor = false): void => {
    const included = selectedAncestor || selected.has(node.id);
    if (included) {
      if (node.kind !== 'element') unsupported = true;
      else sourceNodes.push({ node, parentId });
    }
    node.nodes.forEach((child) => visit(child, node.id, included));
  };
  view.nodes.forEach((node) => visit(node));
  if (unsupported || !sourceNodes.length) return undefined;
  const nodeIds = new Map(sourceNodes.map(({ node }) => [node.id, createId('node')]));
  const elementIds = new Map<string, string>();
  for (const { node } of sourceNodes) if (node.kind === 'element' && node.elementId &&
      !elementIds.has(node.elementId)) {
    elementIds.set(node.elementId, createId('element'));
  }
  const elements = [...elementIds].map(([oldId, id]) => {
    const element = model.elements.find((item) => item.id === oldId);
    if (!element) invalid();
    return cloneElement(element, id);
  });
  const nodes = sourceNodes.map(({ node, parentId }) => ({
    node: {
      ...structuredClone(node),
      id: nodeIds.get(node.id)!,
      ...(node.elementId ? { elementId: elementIds.get(node.elementId)! } : {}),
      x: node.x + offset.x, y: node.y + offset.y,
      nodes: []
    },
    ...(parentId ? { parentId: nodeIds.get(parentId) ?? parentId } : {})
  }));
  const { relationships, connections } =
    duplicateConnections(model, view, nodeIds, elementIds, createId, offset);
  return { type: 'duplicate-selection', viewId: projection.viewId,
    elements, nodes, relationships, connections };
}

function alignedPosition(node: CanvasProjection['nodes'][number],
  bounds: { left: number; right: number; top: number; bottom: number; center: number; middle: number },
  alignment: Alignment): { x: number; y: number } {
  if (alignment === 'left') return { x: bounds.left, y: node.y };
  if (alignment === 'right') return { x: bounds.right - node.width, y: node.y };
  if (alignment === 'center') return { x: bounds.center - node.width / 2, y: node.y };
  if (alignment === 'top') return { x: node.x, y: bounds.top };
  if (alignment === 'bottom') return { x: node.x, y: bounds.bottom - node.height };
  return { x: node.x, y: bounds.middle - node.height / 2 };
}

export function alignSelectionCommand(projection: CanvasProjection,
  alignment: Alignment): Extract<EditorCommand, { type: 'move-many' }> | undefined {
  const nodes = selectedNodes(projection);
  if (nodes.length < 2) return undefined;
  const left = Math.min(...nodes.map((node) => node.x));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const top = Math.min(...nodes.map((node) => node.y));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  const bounds = { left, right, top, bottom, center: (left + right) / 2, middle: (top + bottom) / 2 };
  return { type: 'move-many', viewId: projection.viewId,
    moves: nodes.map((node) => ({ nodeId: node.id, ...alignedPosition(node, bounds, alignment) })) };
}

export function distributeSelectionCommand(projection: CanvasProjection,
  axis: DistributionAxis): Extract<EditorCommand, { type: 'move-many' }> | undefined {
  const horizontal = axis === 'horizontal';
  const nodes = selectedNodes(projection).sort((left, right) =>
    (horizontal ? left.x : left.y) - (horizontal ? right.x : right.y));
  if (nodes.length < 3) return undefined;
  const start = horizontal ? nodes[0].x : nodes[0].y;
  const last = nodes.at(-1)!;
  const end = horizontal ? last.x + last.width : last.y + last.height;
  const totalSize = nodes.reduce((sum, node) => sum + (horizontal ? node.width : node.height), 0);
  const gap = (end - start - totalSize) / (nodes.length - 1);
  let cursor = start;
  return { type: 'move-many', viewId: projection.viewId, moves: nodes.map((node) => {
    const move = { nodeId: node.id, x: horizontal ? cursor : node.x, y: horizontal ? node.y : cursor };
    cursor += (horizontal ? node.width : node.height) + gap;
    return move;
  }) };
}
