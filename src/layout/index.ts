import { validateModelDto } from '../model-dto/index.js';
import { applyDtoPatch, dtoPatch, optimizerView, type OptimizerOutput,
  type OptimizerView } from './adapter.js';
import type { LayoutDiagnostic, LayoutOptions, LayoutResult } from './types.js';

// Issue #100: cast at the legacy optimizer boundary until it is migrated to TypeScript.
import { optimizeDiagram } from '../../lib/layout/optimize-diagram.mjs';

const runOptimizer = optimizeDiagram as unknown as
  (view: OptimizerView, options: LayoutOptions) => OptimizerOutput;

export type { LayoutDiagnostic, LayoutGeometry, LayoutMetrics, LayoutOptions,
  LayoutPatch, LayoutResult } from './types.js';

function diagnostic(code: LayoutDiagnostic['code'], message: string,
  status: 'unsupported' | 'invalid' | 'failed'): LayoutResult {
  return { status, diagnostics: [{ code, severity: 'error', message }] };
}

function checkOptions(input: unknown): LayoutResult | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return diagnostic('INVALID_OPTIONS', 'Layout options require an explicit strategy.', 'invalid');
  }
  const options = input as Record<string, unknown>;
  const allowed = new Set(['strategy', 'mode', 'spacing', 'padding', 'clearance',
    'routeConnections', 'pins']);
  if (Object.keys(options).some((key) => !allowed.has(key)) ||
      options.strategy !== 'builtin' && options.strategy !== 'elk-layered' ||
      options.mode !== undefined && options.mode !== 'full' && options.mode !== 'incremental' ||
      ['spacing', 'padding', 'clearance'].some((key) => options[key] !== undefined &&
        (typeof options[key] !== 'number' || !Number.isFinite(options[key]) ||
          (key === 'spacing' ? Number(options[key]) <= 0 : Number(options[key]) < 0))) ||
      options.routeConnections !== undefined && typeof options.routeConnections !== 'boolean' ||
      options.pins !== undefined && !Array.isArray(options.pins)) {
    return diagnostic('INVALID_OPTIONS', 'Layout options are invalid.', 'invalid');
  }
  if (options.strategy === 'elk-layered') {
    return diagnostic('UNSUPPORTED_STRATEGY', 'The layered strategy is not available yet.', 'unsupported');
  }
  if (options.mode === 'incremental') {
    return diagnostic('UNSUPPORTED_MODE', 'Incremental layout is not available yet.', 'unsupported');
  }
  if (options.pins !== undefined) {
    return diagnostic('UNSUPPORTED_CONSTRAINT', 'Pinned layout is not available yet.', 'unsupported');
  }
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
  if (view.connections.some((item) => !item.sourceId || !item.targetId)) {
    return diagnostic('UNSUPPORTED_CONNECTION',
      'Layout requires connections with both endpoints in the view.', 'unsupported');
  }
  try {
    const result = runOptimizer(optimizerView(view), options);
    const patch = dtoPatch(result);
    return { status: 'ok', view: applyDtoPatch(view, patch), patch,
      metrics: result.metrics, diagnostics: [] };
  } catch {
    return diagnostic('LAYOUT_FAILED', 'The selected view could not be laid out.', 'failed');
  }
}
