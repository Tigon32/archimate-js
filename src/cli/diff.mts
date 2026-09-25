import path from 'node:path';

import { diagnostic } from './diagnostics.mjs';
import { readBoundedXml } from './io.mjs';
import type { DiffOptions, ModelDiffChange } from './types.mjs';

type Eligibility =
  | { eligible: true; model: unknown; reasons: [] }
  | { eligible: false; reasons: Array<{ code: string }> };

type ModelDtoDiff = {
  schemaVersion: 1;
  changes: ModelDiffChange[];
  impactedViewIds: string[];
};

type DiffApi = {
  checkMeffEditingEligibility(xml: unknown): Eligibility;
  diffModelDto(before: unknown, after: unknown): ModelDtoDiff;
};

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(code: string): number {
  emit({ command: 'diff', valid: false, diagnostics: [diagnostic(code)], suggestions: [] });
  return 2;
}

async function loadDiffApi(): Promise<DiffApi> {
  const modulePath = new URL('../model-dto/index.js', import.meta.url).href;
  const loaded: unknown = await import(modulePath);
  if (!loaded || typeof loaded !== 'object' ||
      !('checkMeffEditingEligibility' in loaded) || typeof loaded.checkMeffEditingEligibility !== 'function' ||
      !('diffModelDto' in loaded) || typeof loaded.diffModelDto !== 'function') {
    throw new Error('DIFF_COMPARISON_FAILED');
  }
  return loaded as DiffApi;
}

function ineligibleCode(result: Eligibility): string | undefined {
  if (result.eligible) return undefined;
  return result.reasons.some(({ code }) => code === 'MEFF_DTO_IMPORT_INVALID')
    ? 'DIFF_INPUT_INVALID' : 'DIFF_INPUT_INELIGIBLE';
}

function humanOutput(diff: ModelDtoDiff): string {
  const lines = [`Model diff: ${diff.changes.length ? 'changed' : 'unchanged'}`];
  for (const area of ['semantic', 'presentation'] as const) {
    const changes = diff.changes.filter((change) => change.area === area);
    lines.push(`${area === 'semantic' ? 'Semantic' : 'Presentation'} changes:`);
    if (!changes.length) lines.push('  None');
    for (const change of changes) {
      const fields = change.changedFields.length ? ` [${change.changedFields.join(', ')}]` : '';
      const view = change.viewId ? ` in view ${change.viewId}` : '';
      lines.push(`  ${change.kind} ${change.entity} ${change.id}${view}${fields}`);
    }
  }
  lines.push(`Impacted views (${diff.impactedViewIds.length}): ${diff.impactedViewIds.join(', ') || 'none'}`);
  return `${lines.join('\n')}\n`;
}

function emitDiff(diff: ModelDtoDiff, format: DiffOptions['format']): number {
  const changed = diff.changes.length > 0;
  if (format === 'human') process.stdout.write(humanOutput(diff));
  else emit({ command: 'diff', result: changed ? 'changed' : 'unchanged', ...diff });
  return changed ? 1 : 0;
}

export async function executeDiff(options: DiffOptions): Promise<number> {
  if (path.resolve(options.before) === path.resolve(options.after)) return fail('CLI_USAGE');

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
    const api = await loadDiffApi();
    const before = api.checkMeffEditingEligibility(beforeXml);
    const after = api.checkMeffEditingEligibility(afterXml);
    if (!before.eligible) return fail(ineligibleCode(before)!);
    if (!after.eligible) return fail(ineligibleCode(after)!);
    return emitDiff(api.diffModelDto(before.model, after.model), options.format);
  } catch {
    return fail('DIFF_COMPARISON_FAILED');
  }
}
