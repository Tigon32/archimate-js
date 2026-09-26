import { validateModelDto } from '../model-dto/index.js';
import { dtoPatch, optimizerView, type OptimizerOutput,
  type OptimizerView } from './adapter.js';
import { constrainLayout } from './constraints.js';
import type { LayoutDiagnostic, LayoutOptions, LayoutPin, LayoutRankConstraint,
  LayoutResult } from './types.js';

// Issue #100: cast at the legacy optimizer boundary until it is migrated to TypeScript.
import { optimizeDiagram } from '../../lib/layout/optimize-diagram.mjs';

const runOptimizer = optimizeDiagram as unknown as
  (view: OptimizerView, options: LayoutOptions) => OptimizerOutput;

function diagnostic(code: LayoutDiagnostic['code'], message: string,
  status: 'unsupported' | 'invalid' | 'failed',
  severity: LayoutDiagnostic['severity'] = 'error'): LayoutResult {
  return { status, diagnostics: [{ code, severity, message }] };
}

function validPins(input: unknown): input is LayoutPin[] {
  if (!Array.isArray(input)) return false;
  const ids = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const pin = value as Record<string, unknown>;
    if (Object.keys(pin).some((key) => key !== 'nodeId' && key !== 'strength') ||
        typeof pin.nodeId !== 'string' || !pin.nodeId ||
        pin.strength !== 'hard' && pin.strength !== 'soft' || ids.has(pin.nodeId)) return false;
    ids.add(pin.nodeId);
  }
  return true;
}

function validIds(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(input).size === input.length;
}

function validRanks(input: unknown): input is LayoutRankConstraint[] {
  if (!Array.isArray(input)) return false;
  const ids = new Set<string>();
  return input.every((item) => item && typeof item === 'object' && !Array.isArray(item) &&
    Object.keys(item).every((key) => key === 'nodeId' || key === 'rank') &&
    typeof item.nodeId === 'string' && item.nodeId.length > 0 &&
    (item.rank === 'first' || item.rank === 'last') && !ids.has(item.nodeId) &&
    Boolean(ids.add(item.nodeId)));
}

function checkOptions(input: unknown): LayoutResult | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return diagnostic('INVALID_OPTIONS', 'Layout options require an explicit strategy.', 'invalid');
  }
  const options = input as Record<string, unknown>;
  const allowed = new Set(['strategy', 'mode', 'spacing', 'padding', 'clearance',
    'routeConnections', 'pins', 'changedNodeIds', 'rankConstraints']);
  if (Object.keys(options).some((key) => !allowed.has(key)) ||
      options.strategy !== 'builtin' && options.strategy !== 'elk-layered' ||
      options.mode !== undefined && options.mode !== 'full' && options.mode !== 'incremental' ||
      ['spacing', 'padding', 'clearance'].some((key) => options[key] !== undefined &&
        (typeof options[key] !== 'number' || !Number.isFinite(options[key]) ||
          (key === 'spacing' ? Number(options[key]) <= 0 : Number(options[key]) < 0))) ||
      options.routeConnections !== undefined && typeof options.routeConnections !== 'boolean' ||
      options.pins !== undefined && !validPins(options.pins) ||
      options.rankConstraints !== undefined && !validRanks(options.rankConstraints) ||
      options.mode === 'incremental' && !validIds(options.changedNodeIds) ||
      options.mode !== 'incremental' && options.changedNodeIds !== undefined &&
        !validIds(options.changedNodeIds)) {
    return diagnostic('INVALID_OPTIONS', 'Layout options are invalid.', 'invalid');
  }
  if (options.mode !== 'incremental' && options.changedNodeIds !== undefined) {
    return diagnostic('INVALID_OPTIONS', 'changedNodeIds requires incremental mode.', 'invalid');
  }
  return undefined;
}

function validateTargets(view: Parameters<typeof optimizerView>[0],
  options: LayoutOptions): LayoutResult | undefined {
  const ids = new Set<string>();
  function collect(nodes: typeof view.nodes): void {
    for (const node of nodes) { ids.add(node.id); collect(node.nodes); }
  }
  collect(view.nodes);
  const missingPin = options.pins?.find((pin) => !ids.has(pin.nodeId));
  if (missingPin) return diagnostic('PIN_NODE_NOT_FOUND',
    `Pinned node ${missingPin.nodeId} is not in the selected view.`, 'invalid');
  const missingChanged = options.changedNodeIds?.find((id) => !ids.has(id));
  if (missingChanged) return diagnostic('CHANGED_NODE_NOT_FOUND',
    `Changed node ${missingChanged} is not in the selected view.`, 'invalid');
  const missingRank = options.rankConstraints?.find((rank) => !ids.has(rank.nodeId));
  if (missingRank) return diagnostic('RANK_NODE_NOT_FOUND',
    `Rank-constrained node ${missingRank.nodeId} is not in the selected view.`, 'invalid');
  return undefined;
}

/** Compute opt-in full layout for one DTO view without changing the input model. */
export async function layoutView(input: unknown, viewId: string,
  options: LayoutOptions): Promise<LayoutResult> {
  const optionsError = checkOptions(options);
  if (optionsError) return optionsError;
  let model;
  try { model = validateModelDto(input); }
  catch { return diagnostic('INVALID_MODEL', 'The model DTO is invalid.', 'invalid'); }
  const view = model.views.find((item) => item.id === viewId);
  if (!view) return diagnostic('VIEW_NOT_FOUND', 'The selected view was not found.', 'invalid');
  const targetError = validateTargets(view, options);
  if (targetError) return targetError;
  if (view.connections.some((item) => !item.sourceId || !item.targetId)) {
    return diagnostic('UNSUPPORTED_CONNECTION',
      'Layout requires connections with both endpoints in the view.', 'unsupported');
  }
  if (options.strategy === 'elk-layered') {
    const { layoutElkLayered } = await import('./elk-adapter.js');
    return layoutElkLayered(model, view, options);
  }
  if (options.rankConstraints?.length) return diagnostic('UNSUPPORTED_CONSTRAINT',
    'Rank constraints require the layered strategy.', 'unsupported');
  try {
    const result = runOptimizer(optimizerView(view), options);
    const patch = dtoPatch(result);
    return { status: 'ok', ...constrainLayout(view, patch, result.metrics, options) };
  } catch {
    return diagnostic('LAYOUT_FAILED', 'The selected view could not be laid out.', 'failed');
  }
}
