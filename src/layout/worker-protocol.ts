import type { LayoutOptions, LayoutResult } from './types.js';

const PROTOCOL = 'archimate-js.layout-worker.v1';

export interface LayoutWorkerRequest {
  protocol: typeof PROTOCOL;
  id: number;
  model: unknown;
  viewId: string;
  options: LayoutOptions;
}

export type LayoutWorkerResponse =
  | { protocol: typeof PROTOCOL; id: number; ok: true; result: LayoutResult }
  | { protocol: typeof PROTOCOL; id: number; ok: false; code: 'LAYOUT_FAILED' };

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function point(value: unknown): boolean {
  return object(value) && Number.isFinite(value.x) && Number.isFinite(value.y) &&
    (value.kind === undefined || ['sourceAttachment', 'targetAttachment', 'bendpoint'].includes(String(value.kind)));
}

function geometry(value: unknown): boolean {
  return object(value) && Number.isFinite(value.x) && Number.isFinite(value.y) &&
    Number.isFinite(value.width) && Number.isFinite(value.height);
}

function patch(value: unknown): boolean {
  return object(value) && typeof value.viewId === 'string' &&
    Array.isArray(value.nodes) && Array.isArray(value.connections) &&
    value.nodes.every((entry) => object(entry) && typeof entry.id === 'string' &&
      geometry(entry.before) && geometry(entry.after)) &&
    value.connections.every((entry) => object(entry) && typeof entry.id === 'string' &&
      Array.isArray(entry.before) && entry.before.every(point) &&
      Array.isArray(entry.after) && entry.after.every(point));
}

function diagnostic(value: unknown): boolean {
  return object(value) && typeof value.code === 'string' &&
    (value.severity === 'error' || value.severity === 'warning') &&
    typeof value.message === 'string';
}

function metrics(value: unknown): boolean {
  const keys = ['movedNodeCount', 'reroutedConnectionCount', 'crossingsBefore',
    'crossingsAfter', 'overlapCountBefore', 'overlapCountAfter', 'softPinDisplacement',
    'unaffectedNodeDisplacement', 'violatedConstraintCount'];
  return object(value) && keys.every((key) => Number.isFinite(value[key])) &&
    geometry(value.boundsBefore) && geometry(value.boundsAfter) &&
    Array.isArray(value.pinDisplacements) && value.pinDisplacements.every((item) =>
      object(item) && typeof item.nodeId === 'string' && Number.isFinite(item.distance) &&
      (item.strength === 'hard' || item.strength === 'soft'));
}

function node(value: unknown): boolean {
  return object(value) && typeof value.id === 'string' && typeof value.kind === 'string' &&
    Number.isFinite(value.x) && Number.isFinite(value.y) &&
    Number.isFinite(value.width) && Number.isFinite(value.height) &&
    (value.label === undefined || typeof value.label === 'string') &&
    (value.elementId === undefined || typeof value.elementId === 'string') &&
    Array.isArray(value.nodes) && value.nodes.every(node);
}

function connection(value: unknown): boolean {
  return object(value) && typeof value.id === 'string' && typeof value.kind === 'string' &&
    (value.sourceId === undefined || typeof value.sourceId === 'string') &&
    (value.targetId === undefined || typeof value.targetId === 'string') &&
    (value.relationshipId === undefined || typeof value.relationshipId === 'string') &&
    (value.label === undefined || typeof value.label === 'string') &&
    Array.isArray(value.waypoints) && value.waypoints.every(point);
}

function view(value: unknown): boolean {
  return object(value) && typeof value.id === 'string' &&
    (value.name === undefined || typeof value.name === 'string') &&
    Array.isArray(value.nodes) && value.nodes.every(node) &&
    Array.isArray(value.connections) && value.connections.every(connection);
}

export function isLayoutResult(value: unknown): value is LayoutResult {
  if (!object(value) || !Array.isArray(value.diagnostics) ||
      !value.diagnostics.every(diagnostic)) return false;
  if (value.status === 'ok') return view(value.view) && patch(value.patch) && metrics(value.metrics);
  return value.status === 'unsupported' || value.status === 'invalid' || value.status === 'failed';
}

export function isLayoutWorkerRequest(value: unknown): value is LayoutWorkerRequest {
  return object(value) && value.protocol === PROTOCOL && Number.isSafeInteger(value.id) &&
    typeof value.viewId === 'string' && object(value.options) &&
    (value.options.strategy === 'builtin' || value.options.strategy === 'elk-layered');
}

export function parseLayoutWorkerResponse(value: unknown, id: number): LayoutWorkerResponse | undefined {
  if (!object(value) || value.protocol !== PROTOCOL || value.id !== id) return undefined;
  if (value.ok === true && isLayoutResult(value.result)) {
    return { protocol: PROTOCOL, id, ok: true, result: value.result };
  }
  if (value.ok === false && value.code === 'LAYOUT_FAILED') {
    return { protocol: PROTOCOL, id, ok: false, code: 'LAYOUT_FAILED' };
  }
  return { protocol: PROTOCOL, id, ok: false, code: 'LAYOUT_FAILED' };
}

export function layoutWorkerRequest(id: number, model: unknown, viewId: string,
  options: LayoutOptions): LayoutWorkerRequest {
  return { protocol: PROTOCOL, id, model, viewId, options };
}
