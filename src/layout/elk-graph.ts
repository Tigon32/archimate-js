import type { ElkNode, ElkPort } from 'elkjs';
import type { LayoutOptions } from './types.js';
import type { ViewConnectionDto, ViewDto, ViewNodeDto } from '../model-dto/index.js';

export interface ElkGraphInput {
  root: ElkNode;
  sourcePorts: Map<string, string>;
  targetPorts: Map<string, string>;
}

function side(node: ViewNodeDto, other: ViewNodeDto): string {
  const dx = other.x + other.width / 2 - (node.x + node.width / 2);
  const dy = other.y + other.height / 2 - (node.y + node.height / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'EAST' : 'WEST') :
    (dy >= 0 ? 'SOUTH' : 'NORTH');
}

function port(id: string, edge: ViewConnectionDto, nodes: Map<string, ViewNodeDto>, source: boolean): ElkPort {
  const own = nodes.get(source ? edge.sourceId! : edge.targetId!)!;
  const other = nodes.get(source ? edge.targetId! : edge.sourceId!)!;
  return { id, width: 4, height: 4,
    layoutOptions: { 'elk.port.side': side(own, other) } };
}

function nodeShape(node: ViewNodeDto, parentX: number, parentY: number,
  nodes: Map<string, ViewNodeDto>, connections: ViewConnectionDto[], options: LayoutOptions): ElkNode {
  const ports = connections.flatMap((edge) => {
    const result: ElkPort[] = [];
    if (edge.sourceId === node.id) result.push(port(`${edge.id}::source`, edge, nodes, true));
    if (edge.targetId === node.id) result.push(port(`${edge.id}::target`, edge, nodes, false));
    return result;
  });
  const rank = options.rankConstraints?.find((constraint) => constraint.nodeId === node.id);
  const padding = options.padding ?? 20;
  return { id: node.id, x: node.x - parentX, y: node.y - parentY,
    width: node.width, height: node.height, ports,
    layoutOptions: {
      'elk.nodeSize.constraints': 'MINIMUM_SIZE',
      'elk.nodeSize.minimum': `(${node.width},${node.height})`,
      ...(node.kind === 'container' ? { 'elk.padding':
        `[top=${padding},left=${padding},bottom=${padding},right=${padding}]` } : {}),
      ...(ports.length ? { 'elk.portConstraints': 'FIXED_SIDE' } : {}),
      ...(rank ? { 'elk.layered.layering.layerConstraint': rank.rank.toUpperCase() } : {})
    },
    children: node.nodes.map((child) => nodeShape(child, node.x, node.y,
      nodes, connections, options)) };
}

export function buildElkGraph(view: ViewDto, options: LayoutOptions): ElkGraphInput {
  const nodes = new Map<string, ViewNodeDto>();
  const collect = (items: ViewNodeDto[]): void => {
    for (const node of items) { nodes.set(node.id, node); collect(node.nodes); }
  };
  collect(view.nodes);
  const graphEdges = view.connections.map((edge) => ({ id: edge.id,
    sources: [`${edge.id}::source`], targets: [`${edge.id}::target`] }));
  const spacing = options.spacing ?? 32;
  const root: ElkNode = { id: view.id, children: view.nodes.map((node) => nodeShape(
    node, 0, 0, nodes, view.connections, options)), edges: graphEdges,
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL', 'elk.direction': 'RIGHT',
      'elk.layered.randomizationSeed': '1', 'elk.spacing.nodeNode': String(spacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing),
      'elk.spacing.edgeNode': String(options.clearance ?? 12),
      'elk.padding': `[top=${options.padding ?? 20},left=${options.padding ?? 20},` +
        `bottom=${options.padding ?? 20},right=${options.padding ?? 20}]` } };
  return { root, sourcePorts: new Map(view.connections.map((edge) => [edge.id, `${edge.id}::source`])),
    targetPorts: new Map(view.connections.map((edge) => [edge.id, `${edge.id}::target`])) };
}
