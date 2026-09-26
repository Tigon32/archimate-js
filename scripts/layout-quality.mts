import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { computeLayoutQualityMetrics, layoutQualityCorpus, layoutView,
  renderLayoutQualitySvg } from '../dist/layout/index.js';
import type { ViewDto } from '../src/model-dto/index.ts';

type Strategy = 'builtin' | 'elk-layered';
type RunRecord = {
  caseId: string;
  strategy: Strategy;
  status: string;
  durationMs: number;
  metrics?: unknown;
  diagnostics?: readonly unknown[];
  svgPath?: string;
};

const STRATEGIES: readonly Strategy[] = ['builtin', 'elk-layered'];

function outputDir(): string {
  const arg = process.argv.find((item) => item.startsWith('--output='));
  return arg ? arg.slice('--output='.length) : 'artifacts/layout-quality';
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sourceView(view: ViewDto): ViewDto {
  return structuredClone(view);
}

async function runCase(strategy: Strategy, item: ReturnType<typeof layoutQualityCorpus>[number],
  directory: string): Promise<RunRecord> {
  const view = sourceView(item.model.views.find((candidate) => candidate.id === item.viewId)!);
  const started = performance.now();
  const result = await layoutView(item.model, item.viewId, { strategy, ...item.options });
  const durationMs = Number((performance.now() - started).toFixed(3));
  if (result.status !== 'ok') {
    return { caseId: item.id, strategy, status: result.status, durationMs,
      diagnostics: result.diagnostics };
  }
  const metrics = computeLayoutQualityMetrics(view, result.view, {
    pins: item.options?.pins, changedNodeIds: item.options?.changedNodeIds, durationMs
  });
  const svgName = `${item.id}-${strategy}.svg`;
  await writeFile(path.join(directory, svgName),
    renderLayoutQualitySvg(result.view, `${item.id} ${strategy}`));
  return { caseId: item.id, strategy, status: 'ok', durationMs, metrics, svgPath: svgName };
}

async function main(): Promise<void> {
  const directory = outputDir();
  await mkdir(directory, { recursive: true });
  const corpus = layoutQualityCorpus();
  await writeFile(path.join(directory, 'corpus.json'), stableJson(corpus.map((item) => ({
    id: item.id, description: item.description, provenance: item.provenance,
    coverage: item.coverage, options: item.options ?? {}
  }))));
  const records: RunRecord[] = [];
  for (const item of corpus) for (const strategy of STRATEGIES) {
    records.push(await runCase(strategy, item, directory));
  }
  await writeFile(path.join(directory, 'metrics.json'), stableJson({ generatedBy:
    'scripts/layout-quality.mts', durationRuntimeSensitive: true, records }));
  process.stdout.write(`Wrote ${records.length} layout-quality record(s) to ${directory}\n`);
}

await main();
