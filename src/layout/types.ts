import type { PointDto, ViewDto } from '../model-dto/index.js';

export interface LayoutOptions {
  strategy: 'builtin' | 'elk-layered';
  mode?: 'full' | 'incremental';
  spacing?: number;
  padding?: number;
  clearance?: number;
  routeConnections?: boolean;
  pins?: readonly unknown[];
}

export interface LayoutDiagnostic {
  code: 'INVALID_MODEL' | 'VIEW_NOT_FOUND' | 'UNSUPPORTED_STRATEGY' |
    'UNSUPPORTED_MODE' | 'UNSUPPORTED_CONSTRAINT' | 'UNSUPPORTED_CONNECTION' |
    'INVALID_OPTIONS' | 'LAYOUT_FAILED';
  severity: 'error';
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
}

export type LayoutResult =
  | { status: 'ok'; view: ViewDto; patch: LayoutPatch; metrics: LayoutMetrics; diagnostics: [] }
  | { status: 'unsupported' | 'invalid' | 'failed'; diagnostics: LayoutDiagnostic[] };
