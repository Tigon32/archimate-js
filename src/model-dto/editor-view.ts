import type { LayoutGeometry, LayoutPatch } from '../layout/types.js';
import type { ModelDto, PointDto, StyleDto, ViewNodeDto } from './types.js';
import { invalid } from './validate.js';
import type { CanvasProjection, EditorCommand } from './editor.js';

type View = ModelDto['views'][number];

export type EditorCommandErrorCode =
  | 'DTO_LAYOUT_PATCH_VIEW_MISMATCH'
  | 'DTO_LAYOUT_PATCH_ITEM_NOT_FOUND'
  | 'DTO_LAYOUT_PATCH_STALE'
  | 'DTO_LAYOUT_PATCH_INVALID_GEOMETRY';

export class EditorCommandError extends TypeError {
  constructor(readonly code: EditorCommandErrorCode) {
    super(code);
    this.name = 'EditorCommandError';
  }
}

function rejectLayoutPatch(code: EditorCommandErrorCode): never {
  throw new EditorCommandError(code);
}

export function findNode(nodes: ViewNodeDto[], id: string): ViewNodeDto | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.nodes, id);
    if (child) return child;
  }
  return undefined;
}

export function nodesOf(nodes: ViewNodeDto[], elements: ModelDto['elements'],
  parentId?: string): CanvasProjection['nodes'] {
  return nodes.flatMap((node): CanvasProjection['nodes'] => {
    const element = elements.find((item) => item.id === node.elementId);
    return [
      { id: node.id, kind: node.kind, x: node.x, y: node.y, width: node.width, height: node.height,
        ...(parentId !== undefined ? { parentId } : {}),
        ...(node.elementId !== undefined ? { elementId: node.elementId } : {}),
        ...(element?.type !== undefined ? { type: element.type } : {}),
        ...(element?.name !== undefined ? { name: element.name } : {}),
        ...(node.label !== undefined ? { label: node.label } : {}),
        ...(node.style !== undefined ? { style: structuredClone(node.style) as StyleDto } : {}) },
    ...nodesOf(node.nodes, elements, node.id)
    ];
  });
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

function nodeDepth(nodes: ViewNodeDto[], id: string, depth = 0): number | undefined {
  for (const node of nodes) {
    if (node.id === id) return depth;
    const child = nodeDepth(node.nodes, id, depth + 1);
    if (child !== undefined) return child;
  }
  return undefined;
}

function moveNodeTo(view: View, nodeId: string, x: number, y: number): void {
  const node = findNode(view.nodes, nodeId);
  if (!node || !Number.isFinite(x) || !Number.isFinite(y)) invalid();
  const dx = x - node.x;
  const dy = y - node.y;
  moveChildren(node, dx, dy);
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

export function changeBounds(view: View, command: Extract<EditorCommand,
  { type: 'move' | 'resize' }>): void {
  moveNodeTo(view, command.nodeId, command.x, command.y);
  if (command.type === 'resize') {
    const node = findNode(view.nodes, command.nodeId)!;
    node.width = command.width;
    node.height = command.height;
  }
}

export function moveMany(view: View, command: Extract<EditorCommand, { type: 'move-many' }>): void {
  if (!Array.isArray(command.moves)) invalid();
  const seen = new Set<string>();
  const moves = command.moves.map((move) => {
    if (!move || typeof move !== 'object' || seen.has(move.nodeId) ||
        !findNode(view.nodes, move.nodeId)) invalid();
    seen.add(move.nodeId);
    return { ...move, depth: nodeDepth(view.nodes, move.nodeId)! };
  }).sort((left, right) => left.depth - right.depth);
  for (const move of moves) moveNodeTo(view, move.nodeId, move.x, move.y);
}

export function deleteItem(view: View, itemId: string): void {
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

export function deleteMany(view: View, command: Extract<EditorCommand, { type: 'delete-many' }>): void {
  if (!Array.isArray(command.itemIds)) invalid();
  const available = new Set([...flattenNodes(view.nodes).map((node) => node.id),
    ...view.connections.map((connection) => connection.id)]);
  const ids = [...new Set(command.itemIds)];
  if (ids.some((id) => !available.has(id))) invalid();
  for (const id of ids) {
    if (findNode(view.nodes, id) || view.connections.some((connection) => connection.id === id)) {
      deleteItem(view, id);
    }
  }
}

function flattenNodes(nodes: ViewNodeDto[]): ViewNodeDto[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.nodes)]);
}

function geometryValid(geometry: LayoutGeometry): boolean {
  return [geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isInteger) &&
    geometry.width > 0 && geometry.height > 0;
}

function sameGeometry(node: ViewNodeDto, geometry: LayoutGeometry): boolean {
  return node.x === geometry.x && node.y === geometry.y &&
    node.width === geometry.width && node.height === geometry.height;
}

function samePoints(left: PointDto[], right: PointDto[]): boolean {
  return left.length === right.length && left.every((point, index) =>
    point.x === right[index].x && point.y === right[index].y && point.kind === right[index].kind);
}

function pointsValid(points: PointDto[]): boolean {
  return Array.isArray(points) && points.length >= 2 &&
    points.every((point) => Number.isInteger(point.x) && Number.isInteger(point.y));
}

function validatePatch(view: View, patch: LayoutPatch, side: 'after' | 'before'): void {
  if (!patch || typeof patch !== 'object' || !Array.isArray(patch.nodes) ||
      !Array.isArray(patch.connections)) invalid();
  if (patch.viewId !== view.id) rejectLayoutPatch('DTO_LAYOUT_PATCH_VIEW_MISMATCH');
  const expectedSide = side === 'after' ? 'before' : 'after';
  for (const entry of patch.nodes) {
    if (!entry || typeof entry !== 'object') invalid();
    const node = findNode(view.nodes, entry.id);
    if (!node) rejectLayoutPatch('DTO_LAYOUT_PATCH_ITEM_NOT_FOUND');
    if (!geometryValid(entry.before) || !geometryValid(entry.after)) {
      rejectLayoutPatch('DTO_LAYOUT_PATCH_INVALID_GEOMETRY');
    }
    if (!sameGeometry(node, entry[expectedSide])) rejectLayoutPatch('DTO_LAYOUT_PATCH_STALE');
  }
  for (const entry of patch.connections) {
    if (!entry || typeof entry !== 'object') invalid();
    const connection = view.connections.find((item) => item.id === entry.id);
    if (!connection) rejectLayoutPatch('DTO_LAYOUT_PATCH_ITEM_NOT_FOUND');
    if (!pointsValid(entry.before) || !pointsValid(entry.after)) {
      rejectLayoutPatch('DTO_LAYOUT_PATCH_INVALID_GEOMETRY');
    }
    if (!samePoints(connection.waypoints, entry[expectedSide])) {
      rejectLayoutPatch('DTO_LAYOUT_PATCH_STALE');
    }
  }
}

export function applyLayoutPatch(view: View,
  command: Extract<EditorCommand, { type: 'apply-layout-patch' }>): void {
  if (command.side !== 'after' && command.side !== 'before') invalid();
  validatePatch(view, command.patch, command.side);
  const side = command.side;
  for (const entry of command.patch.nodes) {
    Object.assign(findNode(view.nodes, entry.id)!, entry[side]);
  }
  for (const entry of command.patch.connections) {
    const connection = view.connections.find((item) => item.id === entry.id)!;
    connection.waypoints = entry[side].map((point) => ({ ...point }));
  }
}
