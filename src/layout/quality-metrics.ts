import type { PointDto, ViewConnectionDto, ViewDto, ViewNodeDto } from '../model-dto/index.js';
import type { LayoutPin } from './types.js';

export interface LayoutQualityMetrics {
  nodeOverlapCount: number;
  containmentViolationCount: number;
  edgeNodeIntersectionCount: number;
  edgeCrossingCount: number;
  sharedSegmentCount: number;
  totalBendCount: number;
  maximumBendsPerEdge: number;
  totalEdgeLength: number;
  meanEdgeLength: number;
  labelOverlapCount: number;
  layoutWidth: number;
  layoutHeight: number;
  movedNodeCount: number;
  totalNodeMovement: number;
  meanNodeMovement: number;
  unaffectedNodeDisplacement: number;
  violatedConstraintCount: number;
  hardPinViolationCount: number;
  softPinDisplacement: number;
  durationMs: number;
  durationRuntimeSensitive: true;
  weightedScore: number;
}

export interface LayoutQualityOptions {
  pins?: readonly LayoutPin[];
  changedNodeIds?: readonly string[];
  durationMs?: number;
}

type Rect = { id: string; x: number; y: number; width: number; height: number; parentId?: string };
type Segment = { edgeId: string; a: PointDto; b: PointDto };
type LabelRect = Rect & { ownerId: string };

function flatten(nodes: readonly ViewNodeDto[], parentId?: string): Rect[] {
  return nodes.flatMap((node) => [{ id: node.id, x: node.x, y: node.y,
    width: node.width, height: node.height, parentId }, ...flatten(node.nodes, node.id)]);
}

function nodeMap(view: ViewDto): Map<string, Rect> {
  return new Map(flatten(view.nodes).map((node) => [node.id, node]));
}

function intersects(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}

function contains(parent: Rect, child: Rect): boolean {
  return child.x >= parent.x && child.y >= parent.y &&
    child.x + child.width <= parent.x + parent.width &&
    child.y + child.height <= parent.y + parent.height;
}

function ancestorPairs(nodes: readonly Rect[]): Set<string> {
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const result = new Set<string>();
  for (const node of nodes) {
    for (let id = node.parentId; id; id = parents.get(id)) result.add(pairKey(node.id, id));
  }
  return result;
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function overlapCount(nodes: readonly Rect[]): number {
  const ancestors = ancestorPairs(nodes);
  let count = 0;
  for (let i = 0; i < nodes.length; i++) for (let j = 0; j < i; j++) {
    if (!ancestors.has(pairKey(nodes[i].id, nodes[j].id)) && intersects(nodes[i], nodes[j])) count++;
  }
  return count;
}

function containmentViolations(nodes: readonly Rect[]): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.filter((node) => node.parentId && !contains(byId.get(node.parentId)!, node)).length;
}

function routeSegments(edge: ViewConnectionDto): Segment[] {
  return edge.waypoints.slice(1).map((point, index) => ({ edgeId: edge.id,
    a: edge.waypoints[index], b: point }));
}

function allSegments(view: ViewDto): Segment[] {
  return view.connections.flatMap(routeSegments).filter((segment) =>
    segment.a.x !== segment.b.x || segment.a.y !== segment.b.y);
}

function orientation(a: PointDto, b: PointDto, c: PointDto): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function samePoint(left: PointDto, right: PointDto): boolean {
  return left.x === right.x && left.y === right.y;
}

function crosses(left: Segment, right: Segment): boolean {
  if ([left.a, left.b].some((point) => samePoint(point, right.a) || samePoint(point, right.b))) return false;
  return orientation(left.a, left.b, right.a) * orientation(left.a, left.b, right.b) < 0 &&
    orientation(right.a, right.b, left.a) * orientation(right.a, right.b, left.b) < 0;
}

function crossingCount(segments: readonly Segment[]): number {
  let count = 0;
  for (let i = 0; i < segments.length; i++) for (let j = 0; j < i; j++) {
    if (segments[i].edgeId !== segments[j].edgeId && crosses(segments[i], segments[j])) count++;
  }
  return count;
}

function axisOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) -
    Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function sharedSegment(left: Segment, right: Segment): boolean {
  const horizontal = left.a.y === left.b.y && right.a.y === right.b.y && left.a.y === right.a.y;
  const vertical = left.a.x === left.b.x && right.a.x === right.b.x && left.a.x === right.a.x;
  return horizontal ? axisOverlap(left.a.x, left.b.x, right.a.x, right.b.x) > 0 :
    vertical && axisOverlap(left.a.y, left.b.y, right.a.y, right.b.y) > 0;
}

function sharedSegmentCount(segments: readonly Segment[]): number {
  let count = 0;
  for (let i = 0; i < segments.length; i++) for (let j = 0; j < i; j++) {
    if (segments[i].edgeId !== segments[j].edgeId && sharedSegment(segments[i], segments[j])) count++;
  }
  return count;
}

function pointInside(point: PointDto, rect: Rect): boolean {
  return point.x > rect.x && point.x < rect.x + rect.width &&
    point.y > rect.y && point.y < rect.y + rect.height;
}

function segmentHitsRect(segment: Segment, rect: Rect): boolean {
  if (pointInside(segment.a, rect) || pointInside(segment.b, rect)) return true;
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }];
  return corners.some((corner, index) => crosses(segment, {
    edgeId: rect.id, a: corner, b: corners[(index + 1) % corners.length]
  }));
}

function edgeNodeIntersections(view: ViewDto, nodes: readonly Rect[]): number {
  const endpoints = new Map(view.connections.map((edge) => [edge.id, new Set([edge.sourceId, edge.targetId])]));
  let count = 0;
  for (const edge of view.connections) for (const node of nodes) {
    if (!endpoints.get(edge.id)?.has(node.id) && routeSegments(edge).some((segment) => segmentHitsRect(segment, node))) count++;
  }
  return count;
}

function bendCount(edge: ViewConnectionDto): number {
  let count = 0;
  for (let i = 2; i < edge.waypoints.length; i++) {
    if (orientation(edge.waypoints[i - 2], edge.waypoints[i - 1], edge.waypoints[i]) !== 0) count++;
  }
  return count;
}

function edgeLength(edge: ViewConnectionDto): number {
  return routeSegments(edge).reduce((sum, segment) =>
    sum + Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y), 0);
}

function bounds(nodes: readonly Rect[]): { width: number; height: number } {
  if (!nodes.length) return { width: 0, height: 0 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  return { width: Math.max(...nodes.map((node) => node.x + node.width)) - minX,
    height: Math.max(...nodes.map((node) => node.y + node.height)) - minY };
}

function labelRects(view: ViewDto): LabelRect[] {
  const nodeLabels = flatten(view.nodes).filter((node) => Boolean(nodeLabel(view.nodes, node.id)))
    .map((node) => labelBox(node.id, node.id, node.x + 4, node.y + node.height / 2 - 8,
      textWidth(nodeLabel(view.nodes, node.id)!)));
  const edgeLabels = view.connections.filter((edge) => edge.label)
    .map((edge) => edgeLabelBox(edge));
  return [...nodeLabels, ...edgeLabels];
}

function nodeLabel(nodes: readonly ViewNodeDto[], id: string): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.label;
    const nested = nodeLabel(node.nodes, id);
    if (nested) return nested;
  }
  return undefined;
}

function labelBox(id: string, ownerId: string, x: number, y: number, width: number): LabelRect {
  return { id: `${id}-label`, ownerId, x, y, width, height: 16 };
}

function textWidth(text: string): number {
  return Math.max(16, Math.min(180, text.length * 7));
}

function edgeLabelBox(edge: ViewConnectionDto): LabelRect {
  const middle = edge.waypoints[Math.floor((edge.waypoints.length - 1) / 2)];
  return labelBox(edge.id, edge.id, middle.x - textWidth(edge.label!) / 2, middle.y - 8, textWidth(edge.label!));
}

function labelOverlaps(view: ViewDto): number {
  const labels = labelRects(view);
  const nodes = flatten(view.nodes);
  let count = overlapCount(labels);
  for (const label of labels) count += nodes.filter((node) =>
    node.id !== label.ownerId && intersects(label, node)).length;
  return count;
}

function movement(before: ViewDto, after: ViewDto, options: LayoutQualityOptions) {
  const prior = nodeMap(before), next = nodeMap(after);
  const changed = new Set(options.changedNodeIds || []);
  let moved = 0, total = 0, unaffected = 0;
  for (const [id, node] of prior) {
    const arranged = next.get(id);
    if (!arranged) continue;
    const distance = Math.hypot(arranged.x - node.x, arranged.y - node.y);
    if (distance > 0 || arranged.width !== node.width || arranged.height !== node.height) moved++;
    total += distance;
    if (options.changedNodeIds && !changed.has(id)) unaffected += distance;
  }
  return { moved, total, mean: prior.size ? total / prior.size : 0, unaffected };
}

function pinMetrics(before: ViewDto, after: ViewDto, pins: readonly LayoutPin[] = []) {
  const prior = nodeMap(before), next = nodeMap(after);
  let hard = 0, soft = 0;
  for (const pin of pins) {
    const original = prior.get(pin.nodeId), arranged = next.get(pin.nodeId);
    if (!original || !arranged) continue;
    const moved = Math.hypot(arranged.x - original.x, arranged.y - original.y);
    const resized = arranged.width !== original.width || arranged.height !== original.height;
    if (pin.strength === 'hard' && (moved > 0 || resized)) hard++;
    if (pin.strength === 'soft') soft += moved;
  }
  return { hard, soft };
}

function score(metrics: Omit<LayoutQualityMetrics, 'weightedScore'>): number {
  const penalty = metrics.nodeOverlapCount * 50 + metrics.edgeCrossingCount * 10 +
    metrics.edgeNodeIntersectionCount * 25 + metrics.containmentViolationCount * 50 +
    metrics.labelOverlapCount * 8 + metrics.totalBendCount + metrics.violatedConstraintCount * 100;
  return Number((1 / (1 + penalty)).toFixed(6));
}

export function computeLayoutQualityMetrics(before: ViewDto, after: ViewDto,
  options: LayoutQualityOptions = {}): LayoutQualityMetrics {
  const nodes = flatten(after.nodes);
  const segments = allSegments(after);
  const bends = after.connections.map(bendCount);
  const lengths = after.connections.map(edgeLength);
  const area = bounds(nodes);
  const moved = movement(before, after, options);
  const pins = pinMetrics(before, after, options.pins);
  const base = { nodeOverlapCount: overlapCount(nodes),
    containmentViolationCount: containmentViolations(nodes),
    edgeNodeIntersectionCount: edgeNodeIntersections(after, nodes),
    edgeCrossingCount: crossingCount(segments), sharedSegmentCount: sharedSegmentCount(segments),
    totalBendCount: bends.reduce((sum, value) => sum + value, 0),
    maximumBendsPerEdge: Math.max(0, ...bends),
    totalEdgeLength: Number(lengths.reduce((sum, value) => sum + value, 0).toFixed(3)),
    meanEdgeLength: Number((lengths.reduce((sum, value) => sum + value, 0) /
      Math.max(1, lengths.length)).toFixed(3)),
    labelOverlapCount: labelOverlaps(after), layoutWidth: area.width, layoutHeight: area.height,
    movedNodeCount: moved.moved, totalNodeMovement: Number(moved.total.toFixed(3)),
    meanNodeMovement: Number(moved.mean.toFixed(3)),
    unaffectedNodeDisplacement: Number(moved.unaffected.toFixed(3)),
    violatedConstraintCount: pins.hard + (moved.unaffected > 0 ? 1 : 0),
    hardPinViolationCount: pins.hard, softPinDisplacement: Number(pins.soft.toFixed(3)),
    durationMs: options.durationMs ?? 0, durationRuntimeSensitive: true as const };
  return { ...base, weightedScore: score(base) };
}

export function deterministicQualityMetrics(metrics: LayoutQualityMetrics): Omit<LayoutQualityMetrics, 'durationMs'> {
  const { durationMs, ...stable } = metrics;
  return stable;
}
