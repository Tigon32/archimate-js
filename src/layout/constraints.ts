import { routeViewConnections } from '../../lib/layout/route-view-connections.mjs';
import type { ViewDto, ViewNodeDto } from '../model-dto/index.js';
import { applyDtoPatch } from './adapter.js';
import type { LayoutDiagnostic, LayoutMetrics, LayoutOptions, LayoutPatch } from './types.js';

type BaseMetrics = Omit<LayoutMetrics, 'softPinDisplacement' | 'unaffectedNodeDisplacement' |
  'violatedConstraintCount' | 'pinDisplacements'>;

export interface ConstrainedLayout {
  view: ViewDto;
  patch: LayoutPatch;
  metrics: LayoutMetrics;
  diagnostics: LayoutDiagnostic[];
}

function flattenNodes(nodes: readonly ViewNodeDto[]): ViewNodeDto[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.nodes)]);
}

function addSubtree(node: ViewNodeDto, ids: Set<string>): void {
  ids.add(node.id);
  for (const child of node.nodes) addSubtree(child, ids);
}

function bounds(nodes: readonly ViewNodeDto[]): LayoutMetrics['boundsAfter'] {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  return { x: left, y: top,
    width: Math.max(...nodes.map((node) => node.x + node.width)) - left,
    height: Math.max(...nodes.map((node) => node.y + node.height)) - top };
}

function siblingOverlapCount(nodes: readonly ViewNodeDto[]): number {
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < i; j++) {
      const left = nodes[i], right = nodes[j];
      if (left.x < right.x + right.width && left.x + left.width > right.x &&
          left.y < right.y + right.height && left.y + left.height > right.y) count++;
    }
    count += siblingOverlapCount(nodes[i].nodes);
  }
  return count;
}

function routeAfterConstraints(view: ViewDto, patch: LayoutPatch,
  options: LayoutOptions, reflow: boolean): { patch: LayoutPatch; crossingsAfter?: number } {
  if (!reflow || options.routeConnections === false || !view.connections.length) return { patch };
  const arranged = applyDtoPatch(view, patch);
  const nodes = flattenNodes(arranged.nodes).map((node) => ({ id: node.id,
    x: node.x, y: node.y, w: node.width, h: node.height }));
  const connections = arranged.connections.map((edge) => ({ id: edge.id,
    source: edge.sourceId, target: edge.targetId }));
  const route = routeViewConnections as (input: { nodes: readonly unknown[];
    connections: readonly unknown[]; clearance: number }) => ReturnType<typeof routeViewConnections>;
  const routed = route({ nodes, connections, clearance: options.clearance ?? 12 });
  const connectionPatch = view.connections.flatMap((edge, index) => {
    const points = routed.connections[index].waypoints.map((point, pointIndex, all) => ({
      ...point, kind: pointIndex === 0 ? 'sourceAttachment' as const :
        pointIndex === all.length - 1 ? 'targetAttachment' as const : 'bendpoint' as const
    }));
    if (JSON.stringify(edge.waypoints) === JSON.stringify(points)) return [];
    return [{ id: edge.id, before: edge.waypoints.map((point) => ({ ...point })), after: points }];
  });
  return { patch: { ...patch, connections: connectionPatch },
    crossingsAfter: routed.metrics.crossingCount };
}

function displacement(left: ViewNodeDto, right: ViewNodeDto): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function diagnostics(pinDisplacements: ConstrainedLayout['metrics']['pinDisplacements'],
  unaffectedNodeDisplacement: number, overlapCount: number): LayoutDiagnostic[] {
  const result: LayoutDiagnostic[] = pinDisplacements
    .filter((pin) => pin.strength === 'soft' && pin.distance > 0)
    .map((pin) => ({ code: 'SOFT_PIN_DISPLACED', severity: 'warning',
      message: `Soft-pinned node ${pin.nodeId} moved ${pin.distance}.` }));
  if (unaffectedNodeDisplacement > 0) result.push({ code: 'INCREMENTAL_DISPLACEMENT',
    severity: 'warning', message: `Unaffected nodes moved by ${unaffectedNodeDisplacement}.` });
  if (overlapCount > 0) result.push({ code: 'UNSATISFIED_CONSTRAINT', severity: 'warning',
    message: `Layout retains ${overlapCount} overlapping node pair(s).` });
  return result;
}

function hardPinnedIds(view: ViewDto, options: LayoutOptions): Set<string> {
  const nodes = flattenNodes(view.nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = new Set<string>();
  for (const pin of options.pins || []) {
    if (pin.strength === 'hard') {
      const node = byId.get(pin.nodeId);
      if (node) addSubtree(node, result);
    }
  }
  if (options.mode === 'incremental') {
    const changed = new Set(options.changedNodeIds);
    for (const node of nodes) if (!changed.has(node.id)) result.add(node.id);
  }
  return result;
}

function nodeDistances(before: ViewDto, after: ViewDto,
  options: LayoutOptions): { pinDisplacements: ConstrainedLayout['metrics']['pinDisplacements'];
  unaffectedNodeDisplacement: number } {
  const original = new Map(flattenNodes(before.nodes).map((node) => [node.id, node]));
  const arranged = new Map(flattenNodes(after.nodes).map((node) => [node.id, node]));
  const pinDisplacements = (options.pins || []).map((pin) => ({
    nodeId: pin.nodeId, strength: pin.strength,
    distance: displacement(original.get(pin.nodeId)!, arranged.get(pin.nodeId)!)
  }));
  const changed = new Set(options.changedNodeIds || []);
  const unaffectedNodeDisplacement = options.mode === 'incremental'
    ? flattenNodes(before.nodes).filter((node) => !changed.has(node.id)).reduce((sum, node) =>
      sum + displacement(node, arranged.get(node.id)!), 0) : 0;
  return { pinDisplacements, unaffectedNodeDisplacement };
}

export function constrainLayout(view: ViewDto, patch: LayoutPatch, base: BaseMetrics,
  options: LayoutOptions): ConstrainedLayout {
  const fixed = hardPinnedIds(view, options);
  const constrained = { ...patch, nodes: patch.nodes.filter((node) => !fixed.has(node.id)) };
  const routed = routeAfterConstraints(view, constrained, options, fixed.size > 0);
  const result = applyDtoPatch(view, routed.patch);
  const nodesBefore = flattenNodes(view.nodes);
  const nodesAfter = flattenNodes(result.nodes);
  const distances = nodeDistances(view, result, options);
  const softPinDisplacement = distances.pinDisplacements
    .filter((pin) => pin.strength === 'soft').reduce((sum, pin) => sum + pin.distance, 0);
  const movedNodeCount = nodesBefore.filter((node, index) => {
    const next = nodesAfter[index];
    return node.x !== next.x || node.y !== next.y || node.width !== next.width ||
      node.height !== next.height;
  }).length;
  const overlapCountAfter = siblingOverlapCount(result.nodes);
  const metrics: LayoutMetrics = { ...base, movedNodeCount,
    crossingsAfter: routed.crossingsAfter ?? base.crossingsAfter,
    reroutedConnectionCount: routed.patch.connections.length,
    overlapCountAfter,
    boundsAfter: bounds(nodesAfter), softPinDisplacement,
    unaffectedNodeDisplacement: distances.unaffectedNodeDisplacement,
    violatedConstraintCount: distances.pinDisplacements.filter((pin) =>
      pin.strength === 'soft' && pin.distance > 0).length +
      (distances.unaffectedNodeDisplacement > 0 ? 1 : 0) + overlapCountAfter,
    pinDisplacements: distances.pinDisplacements };
  return { view: result, patch: routed.patch, metrics,
    diagnostics: diagnostics(metrics.pinDisplacements, metrics.unaffectedNodeDisplacement,
      metrics.overlapCountAfter) };
}
