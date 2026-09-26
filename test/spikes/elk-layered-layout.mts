import ELK from 'elkjs';
import type { ElkExtendedEdge, ElkNode } from 'elkjs';

// SYNTHETIC: hand-authored graph for a narrow ELK 0.12.0 feasibility spike.
const graph = (preserveMinimumSize = true): ElkNode => ({
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.direction': 'RIGHT',
    'elk.layered.randomizationSeed': '1'
  },
  children: [
    {
      id: 'group', width: 260, height: 150,
      layoutOptions: {
        'elk.padding': '[top=24,left=20,bottom=20,right=20]',
        ...(preserveMinimumSize ? {
          'elk.nodeSize.constraints': 'MINIMUM_SIZE',
          'elk.nodeSize.minimum': '(260,150)'
        } : {})
      },
      children: [{
        id: 'inside', width: 80, height: 50,
        layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
        ports: [{ id: 'inside-east', width: 4, height: 4,
          layoutOptions: { 'elk.port.side': 'EAST' } }]
      }]
    },
    {
      id: 'outside', width: 90, height: 56,
      layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
      ports: [{ id: 'outside-west', width: 4, height: 4,
        layoutOptions: { 'elk.port.side': 'WEST' } }]
    }
  ],
  edges: [{ id: 'cross', sources: ['inside-east'], targets: ['outside-west'],
    labels: [{ id: 'label', text: 'SYNTHETIC relation', width: 110, height: 18 }] }]
});

type PositionedNode = { id: string; x: number; y: number; width: number; height: number };

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}

function collect(node: ElkNode, parentX = 0, parentY = 0): PositionedNode[] {
  const x = parentX + (node.x || 0), y = parentY + (node.y || 0);
  const current = [{ id: node.id, x, y, width: node.width || 0, height: node.height || 0 }];
  return current.concat(...(node.children || []).map((child) => collect(child, x, y)));
}

async function layoutOnce(preserveMinimumSize = true): Promise<{
  nodes: PositionedNode[]; edge: ElkExtendedEdge
}> {
  const output = await new ELK().layout(graph(preserveMinimumSize));
  const edge = output.edges?.[0];
  ensure(edge, 'cross-hierarchy relationship returned');
  const section = edge.sections?.[0];
  ensure(section, 'orthogonal edge section returned');
  ensure(section.incomingShape === 'inside-east', 'source port shape returned');
  ensure(section.outgoingShape === 'outside-west', 'target port shape returned');
  ensure(section.startPoint && section.endPoint, 'port attachment points returned');
  ensure(edge.labels?.[0]?.x !== undefined && edge.labels[0].y !== undefined,
    'edge label received output geometry');
  const nodes = collect(output).filter((node) => node.id !== 'root');
  const inside = nodes.find((node) => node.id === 'inside');
  const group = nodes.find((node) => node.id === 'group');
  const outside = nodes.find((node) => node.id === 'outside');
  ensure(inside && group && outside, 'compound and nested nodes returned');
  ensure(inside.x >= group.x && inside.y >= group.y,
    'nested coordinates convert to absolute DTO-view coordinates');
  ensure(section.startPoint.x === inside.x + inside.width + 4,
    'east source port outer edge aligns with the inside node east boundary');
  ensure(section.startPoint.y >= inside.y && section.startPoint.y <= inside.y + inside.height,
    'east source port attaches within the inside node vertical bounds');
  ensure(section.endPoint.x === outside.x - 4,
    'west target port outer edge aligns with the outside node west boundary');
  ensure(section.endPoint.y >= outside.y && section.endPoint.y <= outside.y + outside.height,
    'west target port attaches within the outside node vertical bounds');
  return { nodes, edge };
}

const first = await layoutOnce();
const second = await layoutOnce();
const unconstrained = await layoutOnce(false);
same(second, first, 'fixed seed and input produce repeatable geometry');
const unconstrainedGroup = unconstrained.nodes.find((node) => node.id === 'group');
ensure(unconstrainedGroup?.width === 124 && unconstrainedGroup.height === 94,
  'omitting the minimum-size constraint reproduces the container shrink');

// Model the reversible DTO patch boundary from absolute nodes and route points.
const authoredNodes = [
  { id: 'group', x: 20, y: 30, width: 260, height: 150 },
  { id: 'inside', x: 45, y: 65, width: 80, height: 50 },
  { id: 'outside', x: 340, y: 45, width: 90, height: 56 }
];
const beforeWaypoints = [{ x: 100, y: 100 }, { x: 300, y: 100 }];
const section = first.edge.sections?.[0];
ensure(section, 'edge section exists for patch mapping');
const route = [section.startPoint, ...(section.bendPoints || []), section.endPoint]
  .map((point, index, points) => ({ ...point,
    kind: index === 0 ? 'sourceAttachment' : index === points.length - 1
      ? 'targetAttachment' : 'bendpoint' }));
const patch = first.nodes.map((node) => ({
  id: node.id,
  before: (({ x, y, width, height }) => ({ x, y, width, height }))(
    authoredNodes.find((entry) => entry.id === node.id)!),
  after: { x: node.x, y: node.y, width: node.width, height: node.height }
}));
const applied = patch.map((entry) => ({ id: entry.id, ...entry.after }));
const inverted = patch.map((entry) => ({ id: entry.id, ...entry.before }));
const connectionPatch = { before: beforeWaypoints, after: route };
same(inverted, authoredNodes, 'captured node geometry is invertible as a DTO patch');
ensure(JSON.stringify(applied) !== JSON.stringify(authoredNodes),
  'layout changes authored node geometry');
same(connectionPatch.before, beforeWaypoints, 'connection routes retain a before snapshot');
same(connectionPatch.after.map(({ x, y }) => ({ x, y })),
  [section.startPoint, ...(section.bendPoints || []), section.endPoint],
  'ELK edge sections map to reversible DTO waypoints');

console.log(JSON.stringify({
  fixture: 'SYNTHETIC',
  elkjsVersion: '0.12.0',
  strategy: 'layered',
  nodes: first.nodes,
  edge: first.edge,
  withoutMinimumSize: {
    group: unconstrainedGroup,
    authoredMinimum: { width: 260, height: 150 }
  },
  connectionPatch,
  deterministic: true,
  dtoGeometryPatchInvertible: true
}, null, 2));
