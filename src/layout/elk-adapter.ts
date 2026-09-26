import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs';
import { applyDtoPatch } from './adapter.js';
import { buildElkGraph } from './elk-graph.js';
import type { LayoutDiagnostic, LayoutGeometry, LayoutMetrics, LayoutOptions,
  LayoutPatch, LayoutResult } from './types.js';
import type { ModelDto, PointDto, ViewDto, ViewNodeDto } from '../model-dto/index.js';

function failure(code: LayoutDiagnostic['code'], message: string,
  status: 'unsupported' | 'failed' = 'unsupported'): LayoutResult {
  return { status, diagnostics: [{ code, severity: 'error', message }] };
}

function flatten(nodes: ViewNodeDto[]): ViewNodeDto[] {
  return nodes.flatMap((node) => [node, ...flatten(node.nodes)]);
}

function collectPositions(node: ElkNode, parentX: number, parentY: number,
  positions: Map<string, LayoutGeometry>): void {
  const x = parentX + (node.x ?? 0), y = parentY + (node.y ?? 0);
  if (node.id && Number.isFinite(node.width) && Number.isFinite(node.height)) {
    positions.set(node.id, { x: Math.round(x), y: Math.round(y),
      width: Math.round(node.width!), height: Math.round(node.height!) });
  }
  for (const child of node.children || []) collectPositions(child, x, y, positions);
}

function route(edge: ElkExtendedEdge, sourcePort: string,
  targetPort: string): PointDto[] | undefined {
  const parts = edge.sections || [];
  if (!parts.length || parts[0].incomingShape !== sourcePort ||
      parts.at(-1)?.outgoingShape !== targetPort) return undefined;
  const points: PointDto[] = [];
  for (const item of parts) {
    const sequence = [item.startPoint, ...(item.bendPoints || []), item.endPoint];
    if (points.length && (points.at(-1)!.x !== item.startPoint.x ||
        points.at(-1)!.y !== item.startPoint.y)) return undefined;
    for (const point of sequence) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
      const previous = points.at(-1);
      if (!previous || previous.x !== point.x || previous.y !== point.y) {
        if (previous && previous.x !== point.x && previous.y !== point.y) return undefined;
        points.push({ x: Math.round(point.x), y: Math.round(point.y), kind: 'bendpoint' });
      }
    }
  }
  if (points.length < 2) return undefined;
  points[0].kind = 'sourceAttachment';
  points.at(-1)!.kind = 'targetAttachment';
  return points;
}

function geometryPatch(view: ViewDto, output: ElkNode, routeOutput: boolean,
  ports: ReturnType<typeof buildElkGraph>): LayoutPatch | undefined {
  const positions = new Map<string, LayoutGeometry>();
  for (const node of output.children || []) collectPositions(node, 0, 0, positions);
  const nodes = flatten(view.nodes).flatMap((node) => {
    const after = positions.get(node.id);
    if (!after || after.width <= 0 || after.height <= 0) return [];
    const before = { x: node.x, y: node.y, width: node.width, height: node.height };
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ id: node.id, before, after }];
  });
  const outputEdges = new Map((output.edges || []).map((edge) => [edge.id, edge]));
  const connections = routeOutput ? view.connections.map((connection) => {
    const edge = outputEdges.get(connection.id);
    const mapped = edge && route(edge,
      ports.sourcePorts.get(connection.id)!, ports.targetPorts.get(connection.id)!);
    if (!mapped) throw new Error('UNSUPPORTED_ELK_ROUTE');
    return { id: connection.id, before: connection.waypoints.map((point) => ({ ...point })), after: mapped };
  }).filter((entry) => JSON.stringify(entry.before) !== JSON.stringify(entry.after)) : [];
  if (positions.size !== flatten(view.nodes).length) return undefined;
  return { viewId: view.id, nodes, connections };
}

function parentIds(nodes: ViewNodeDto[], parentId: string | undefined,
  parents: Map<string, string | undefined>): void {
  for (const node of nodes) {
    parents.set(node.id, parentId);
    parentIds(node.nodes, node.id, parents);
  }
}

function rankSatisfied(output: ElkNode, view: ViewDto, options: LayoutOptions): boolean {
  const positions = new Map<string, LayoutGeometry>();
  for (const node of output.children || []) collectPositions(node, 0, 0, positions);
  const parents = new Map<string, string | undefined>();
  parentIds(view.nodes, undefined, parents);
  for (const constraint of options.rankConstraints || []) {
    const target = positions.get(constraint.nodeId);
    if (!target) return false;
    const parent = parents.get(constraint.nodeId);
    const siblings = [...parents].filter(([, candidateParent]) => candidateParent === parent)
      .map(([id]) => positions.get(id)!);
    if (siblings.some((node) => constraint.rank === 'first' ? target.x > node.x : target.x < node.x)) {
      return false;
    }
  }
  return flatten(view.nodes).length === positions.size;
}

function bounds(nodes: ViewNodeDto[]): LayoutGeometry {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  return { x: left, y: top, width: Math.max(...nodes.map((node) => node.x + node.width)) - left,
    height: Math.max(...nodes.map((node) => node.y + node.height)) - top };
}

function overlaps(nodes: ViewNodeDto[]): number {
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.x < b.x + b.width && a.x + a.width > b.x &&
          a.y < b.y + b.height && a.y + a.height > b.y) count++;
    }
    count += overlaps(nodes[i].nodes);
  }
  return count;
}

function turn(a: PointDto, b: PointDto, c: PointDto): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segments(points: PointDto[]): Array<[PointDto, PointDto]> {
  return points.slice(1).map((point, index) => [points[index], point]);
}

function crossingCount(connections: ViewDto['connections']): number {
  let count = 0;
  for (let i = 0; i < connections.length; i++) {
    const left = segments(connections[i].waypoints);
    for (let j = 0; j < i; j++) {
      const right = segments(connections[j].waypoints);
      for (const [a, b] of left) for (const [c, d] of right) {
        const shared = [a, b].some((p) => [c, d].some((q) => p.x === q.x && p.y === q.y));
        if (!shared && turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) count++;
      }
    }
  }
  return count;
}

function metrics(before: ViewDto, after: ViewDto, patch: LayoutPatch): LayoutMetrics {
  const prior = flatten(before.nodes), next = flatten(after.nodes);
  const overlapCountBefore = overlaps(before.nodes), overlapCountAfter = overlaps(after.nodes);
  return { movedNodeCount: patch.nodes.length, reroutedConnectionCount: patch.connections.length,
    crossingsBefore: crossingCount(before.connections), crossingsAfter: crossingCount(after.connections),
    overlapCountBefore, overlapCountAfter,
    boundsBefore: bounds(prior), boundsAfter: bounds(next), softPinDisplacement: 0,
    unaffectedNodeDisplacement: 0, violatedConstraintCount: overlapCountAfter,
    pinDisplacements: [] };
}

function hasLabels(model: ModelDto, view: ViewDto): boolean {
  return view.connections.some((edge) => {
    const text = edge.label ?? model.relationships.find((item) => item.id === edge.relationshipId)?.name;
    return typeof text === 'string' && text.length > 0;
  });
}

export async function layoutElkLayered(model: ModelDto, view: ViewDto,
  options: LayoutOptions): Promise<LayoutResult> {
  if (options.mode === 'incremental' || options.pins?.length) {
    return failure('UNSUPPORTED_CONSTRAINT',
      'The layered strategy does not support incremental layout or node pins.');
  }
  if (hasLabels(model, view)) {
    return failure('UNSUPPORTED_CONSTRAINT',
      'The layered strategy cannot represent ELK edge-label geometry in the current DTO canvas contract.');
  }
  try {
    const input = buildElkGraph(view, options);
    const output = await new ELK().layout(input.root);
    if (!rankSatisfied(output, view, options)) return failure('UNSATISFIED_CONSTRAINT',
      'The layered strategy could not satisfy the requested rank constraints.');
    const patch = geometryPatch(view, output, options.routeConnections !== false, input);
    if (!patch) return failure('LAYOUT_FAILED', 'The layered strategy returned incomplete node geometry.', 'failed');
    const arranged = applyDtoPatch(view, patch);
    return { status: 'ok', view: arranged, patch, metrics: metrics(view, arranged, patch), diagnostics: [] };
  } catch (error) {
    if (error instanceof Error && error.message === 'UNSUPPORTED_ELK_ROUTE') {
      return failure('UNSUPPORTED_CONNECTION',
        'The layered strategy did not return a complete route with valid endpoint ports.');
    }
    return failure('LAYOUT_FAILED', 'The layered strategy could not lay out the selected view.', 'failed');
  }
}
