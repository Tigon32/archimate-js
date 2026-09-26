import type { PointDto, ViewDto } from '../model-dto/index.js';

export interface LayoutOptions {
  strategy: 'builtin' | 'elk-layered';
  mode?: 'full' | 'incremental';
  spacing?: number;
  padding?: number;
  clearance?: number;
  routeConnections?: boolean;
  pins?: readonly LayoutPin[];
  changedNodeIds?: readonly string[];
  rankConstraints?: readonly LayoutRankConstraint[];
}

export interface LayoutPin {
  nodeId: string;
  strength: 'hard' | 'soft';
}

export interface LayoutRankConstraint {
  nodeId: string;
  rank: 'first' | 'last';
}

export interface LayoutDiagnostic {
  code: 'INVALID_MODEL' | 'VIEW_NOT_FOUND' | 'UNSUPPORTED_STRATEGY' |
    'UNSUPPORTED_MODE' | 'UNSUPPORTED_CONSTRAINT' | 'UNSUPPORTED_CONNECTION' |
    'INVALID_OPTIONS' | 'LAYOUT_FAILED' | 'PIN_NODE_NOT_FOUND' |
    'CHANGED_NODE_NOT_FOUND' | 'RANK_NODE_NOT_FOUND' | 'SOFT_PIN_DISPLACED' | 'INCREMENTAL_DISPLACEMENT' |
    'UNSATISFIED_CONSTRAINT';
  severity: 'error' | 'warning';
  message: string;
}

export interface LayoutGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutPatch {
  viewId: string;
  nodes: { id: string; before: LayoutGeometry; after: LayoutGeometry }[];
  connections: { id: string; before: PointDto[]; after: PointDto[] }[];
}

export interface LayoutMetrics {
  movedNodeCount: number;
  reroutedConnectionCount: number;
  crossingsBefore: number;
  crossingsAfter: number;
  overlapCountBefore: number;
  overlapCountAfter: number;
  boundsBefore: LayoutGeometry;
  boundsAfter: LayoutGeometry;
  softPinDisplacement: number;
  unaffectedNodeDisplacement: number;
  violatedConstraintCount: number;
  pinDisplacements: { nodeId: string; strength: LayoutPin['strength']; distance: number }[];
}

export type LayoutResult =
  | { status: 'ok'; view: ViewDto; patch: LayoutPatch; metrics: LayoutMetrics; diagnostics: LayoutDiagnostic[] }
  | { status: 'unsupported' | 'invalid' | 'failed'; diagnostics: LayoutDiagnostic[] };
