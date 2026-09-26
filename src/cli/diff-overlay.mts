import { renderArtifacts } from './browser.mjs';
import { diagnostic, safeErrorCode } from './diagnostics.mjs';
import { readBoundedXml, writeAtomic } from './io.mjs';
import type { CliResult, DiffOverlayOptions } from './types.mjs';

type Eligibility =
  | { eligible: true; model: unknown }
  | { eligible: false; reasons: Array<{ code: string }> };

type DiffOverlayApi = {
  checkMeffEditingEligibility(xml: unknown): Eligibility;
  renderModelDtoDiffOverlay(before: unknown, after: unknown, viewId: string): string;
};

type ViewRecord = { id: string; name?: string };
type ModelRecord = { views: ViewRecord[] };
type Bounds = { x: number; y: number; width: number; height: number };

function emit(value: CliResult): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(code: string): number {
  emit({ command: 'diff-overlay', valid: false, diagnostics: [diagnostic(code)], suggestions: [] });
  return 2;
}

function isModel(value: unknown): value is ModelRecord {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { views?: unknown }).views));
}

function selectViewId(options: DiffOverlayOptions, before: unknown, after: unknown): string | undefined {
  if (options.viewId) return options.viewId;
  const views = [after, before].filter(isModel).flatMap((model) => model.views)
    .filter((view) => view.name === options.viewName);
  const ids = [...new Set(views.map((view) => view.id))];
  return ids.length === 1 ? ids[0] : undefined;
}

async function loadDiffOverlayApi(): Promise<DiffOverlayApi> {
  const modulePath = new URL('../model-dto/index.js', import.meta.url).href;
  const loaded: unknown = await import(modulePath);
  if (!loaded || typeof loaded !== 'object' ||
      !('checkMeffEditingEligibility' in loaded) ||
      typeof loaded.checkMeffEditingEligibility !== 'function' ||
      !('renderModelDtoDiffOverlay' in loaded) ||
      typeof loaded.renderModelDtoDiffOverlay !== 'function') {
    throw new Error('DIFF_COMPARISON_FAILED');
  }
  return loaded as DiffOverlayApi;
}

function ineligibleCode(result: Eligibility): string | undefined {
  if (result.eligible) return undefined;
  return result.reasons.some(({ code }) => code === 'MEFF_DTO_IMPORT_INVALID')
    ? 'DIFF_INPUT_INVALID' : 'DIFF_INPUT_INELIGIBLE';
}

function svgBounds(svg: string): Bounds {
  const root = svg.match(/^<svg\b([^>]*)>/)?.[1];
  const values = root?.match(/\bviewBox="([^"]+)"/)?.[1].trim().split(/\s+/).map(Number);
  if (values?.length === 4 && values.every(Number.isFinite)) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }
  throw new Error('VIEW_RENDER_FAILED');
}

function unionBounds(left: Bounds, right: Bounds): Bounds {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: Math.max(1, maxX - x), height: Math.max(1, maxY - y) };
}

function numberText(value: number): string {
  return String(Object.is(value, -0) ? 0 : value);
}

function withBounds(svg: string, bounds: Bounds): string {
  const root = svg.match(/^<svg\b([^>]*)>/);
  if (!root) throw new Error('VIEW_RENDER_FAILED');
  let attrs = root[1].replace(/\s(?:viewBox|width|height)="[^"]*"/gi, '');
  attrs += ` viewBox="${numberText(bounds.x)} ${numberText(bounds.y)} ` +
    `${numberText(bounds.width)} ${numberText(bounds.height)}"`;
  attrs += ` width="${numberText(bounds.width)}" height="${numberText(bounds.height)}"`;
  return `<svg${attrs}>${svg.slice(root[0].length)}`;
}

function innerSvg(svg: string): string {
  const root = svg.match(/^<svg\b[^>]*>/);
  if (!root || !/<\/svg>$/.test(svg)) throw new Error('VIEW_RENDER_FAILED');
  return svg.slice(root[0].length, -'</svg>'.length);
}

export function composeOverlay(baseSvg: string, overlaySvg: string): string {
  const expanded = withBounds(baseSvg, unionBounds(svgBounds(baseSvg), svgBounds(overlaySvg)));
  return expanded.replace(/<\/svg>$/, `<g class="archimate-diff-overlay">` +
    `${innerSvg(overlaySvg)}</g></svg>`);
}

export async function executeDiffOverlay(packageRoot: string,
  options: DiffOverlayOptions): Promise<number> {
  let beforeXml: string;
  let afterXml: string;
  try {
    [beforeXml, afterXml] = await Promise.all([
      readBoundedXml(options.before), readBoundedXml(options.after)
    ]);
  } catch {
    return fail('DIFF_INPUT_INVALID');
  }

  try {
    const api = await loadDiffOverlayApi();
    const before = api.checkMeffEditingEligibility(beforeXml);
    const after = api.checkMeffEditingEligibility(afterXml);
    if (!before.eligible) return fail(ineligibleCode(before)!);
    if (!after.eligible) return fail(ineligibleCode(after)!);
    const viewId = selectViewId(options, before.model, after.model);
    if (!viewId) return fail('VIEW_NOT_FOUND');
    const base = await renderArtifacts(packageRoot, afterXml, { command: 'render',
      input: options.after, output: options.output, viewId, chrome: options.chrome });
    if (typeof base.svg !== 'string') throw new Error('VIEW_RENDER_FAILED');
    const svg = composeOverlay(base.svg, api.renderModelDtoDiffOverlay(before.model, after.model, viewId));
    await writeAtomic(options.output, svg);
    emit({ command: 'diff-overlay', valid: true, diagnostics: [], suggestions: [] });
    return 0;
  } catch (error) {
    return fail(safeErrorCode(error));
  }
}
