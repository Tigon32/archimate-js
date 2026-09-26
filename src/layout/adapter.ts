import type { ViewConnectionDto, ViewDto, ViewNodeDto } from '../model-dto/index.js';
import type { LayoutGeometry, LayoutPatch, LayoutMetrics } from './types.js';

interface OptimizerNode {
  id: string; x: number; y: number; w: number; h: number;
  nodes: OptimizerNode[];
}

interface OptimizerConnection {
  id: string; $type: 'archimate:Connection'; source: string; target: string;
  waypointsNode: { waypoints: { x: number; y: number; kind?: string }[] };
}

export interface OptimizerView {
  id: string;
  viewElements: (OptimizerNode | OptimizerConnection)[];
}

interface LegacyGeometry { x: number; y: number; w: number; h: number }

export interface OptimizerOutput {
  patch: {
    viewId: string;
    nodes: { id: string; before: LegacyGeometry; after: LegacyGeometry }[];
    connections: { id: string; before: ViewConnectionDto['waypoints'];
      after: ViewConnectionDto['waypoints'] }[];
  };
  metrics: Pick<LayoutMetrics, 'movedNodeCount' | 'reroutedConnectionCount' |
    'crossingsBefore' | 'crossingsAfter' | 'overlapCountBefore' | 'overlapCountAfter' |
    'boundsBefore' | 'boundsAfter'>;
}

function nodeShape(node: ViewNodeDto): OptimizerNode {
  return { id: node.id, x: node.x, y: node.y, w: node.width, h: node.height,
    nodes: node.nodes.map(nodeShape) };
}

export function optimizerView(view: ViewDto): OptimizerView {
  return { id: view.id, viewElements: [
    ...view.nodes.map(nodeShape),
    ...view.connections.map((connection) => ({ id: connection.id,
      $type: 'archimate:Connection' as const, source: connection.sourceId!,
      target: connection.targetId!,
      waypointsNode: { waypoints: connection.waypoints.map((point) => ({ ...point })) } }))
  ] };
}

function dtoGeometry(geometry: LegacyGeometry): LayoutGeometry {
  return { x: geometry.x, y: geometry.y, width: geometry.w, height: geometry.h };
}

export function dtoPatch(result: OptimizerOutput): LayoutPatch {
  return { viewId: result.patch.viewId,
    nodes: result.patch.nodes.map((entry) => ({ id: entry.id,
      before: dtoGeometry(entry.before), after: dtoGeometry(entry.after) })),
    connections: result.patch.connections.map((entry) => ({ id: entry.id,
      before: entry.before.map((point) => ({ ...point })),
      after: entry.after.map((point, index) => ({
        x: Math.round(point.x), y: Math.round(point.y),
        kind: index === 0 ? 'sourceAttachment' :
          index === entry.after.length - 1 ? 'targetAttachment' : 'bendpoint'
      })) })) };
}

export function applyDtoPatch(view: ViewDto, patch: LayoutPatch): ViewDto {
  const nodeChanges = new Map(patch.nodes.map((entry) => [entry.id, entry.after]));
  const connectionChanges = new Map(patch.connections.map((entry) => [entry.id, entry.after]));
  function updatedNode(node: ViewNodeDto): ViewNodeDto {
    return { ...node, ...nodeChanges.get(node.id), style: node.style && { ...node.style },
      nodes: node.nodes.map(updatedNode) };
  }
  return { ...view, nodes: view.nodes.map(updatedNode),
    connections: view.connections.map((connection) => ({ ...connection,
      style: connection.style && { ...connection.style },
      waypoints: (connectionChanges.get(connection.id) || connection.waypoints)
        .map((point) => ({ ...point })) })) };
}
