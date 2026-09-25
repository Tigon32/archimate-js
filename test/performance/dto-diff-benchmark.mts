// SYNTHETIC: Measures only the public headless ModelDto diff API.
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
// @ts-expect-error Node types are excluded from the application TypeScript project.
import path from 'node:path';
// @ts-expect-error Node types are excluded from the application TypeScript project.
import { pathToFileURL } from 'node:url';
// @ts-expect-error Node types are excluded from the application TypeScript project.
import { performance } from 'node:perf_hooks';
import type { ModelDtoDiff } from '../../src/model-dto/diff.js';
import {
  classifyPerformance,
  summarizeSamples
} from './performance-contract.mts';
import {
  DTO_DIFF_ARTIFACT_FORMAT,
  DTO_DIFF_BENCHMARK_SCHEMA_VERSION,
  DTO_DIFF_BUDGETS_MS,
  DTO_DIFF_FIXTURE_VERSION,
  DTO_DIFF_HARD_LIMITS_MS,
  DTO_DIFF_REPEATS,
  DTO_DIFF_TIERS,
  DTO_DIFF_WARMUP_RUNS,
  type DtoDiffScenario,
  type DtoDiffTier,
  type DtoDiffTierName
} from './dto-diff-contract.mts';
import { createDtoDiffFixture } from './dto-diff-fixtures.mts';

export interface DtoDiffMeasurement {
  samplesMs: number[];
  medianMs: number;
  medianAbsoluteDeviationMs: number;
  toleranceMs: number;
  budgetMs: number;
  hardLimitMs: number;
  budgetStatus: 'within' | 'exceeded';
  hardLimitStatus: 'within' | 'exceeded';
}

interface ScenarioResult {
  changeCount: number;
  impactedViewCount: number;
  measurement: DtoDiffMeasurement;
}

interface TierResult {
  tier: DtoDiffTier;
  fixture: {
    provenance: 'SYNTHETIC';
    fixtureVersion: number;
    elementCount: number;
    relationshipCount: number;
    nodeCount: number;
    connectionCount: number;
  };
  fixtureFingerprint: string;
  scenarios: Record<DtoDiffScenario, ScenarioResult>;
}

export interface DtoDiffBenchmarkResult {
  schemaVersion: number;
  contractVersion: number;
  provenance: 'SYNTHETIC';
  artifact: {
    format: string;
    createdAt: string;
    retentionDays: number;
    comparisonKey: string;
    source: {
      repository: string | null;
      revision: string | null;
      runId: string | null;
      runAttempt: string | null;
    };
  };
  environment: {
    node: string;
    platform: string;
    arch: string;
    cpuCount: number;
    ci: boolean;
  };
  options: {
    tiers: DtoDiffTier[];
    repeats: number;
    warmupRuns: number;
  };
  benchmarks: TierResult[];
}

export type PublicDiff = (before: unknown, after: unknown) => ModelDtoDiff;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex');
}

function measureScenario(
  diff: PublicDiff,
  before: unknown,
  after: unknown,
  tier: DtoDiffTier,
  scenario: DtoDiffScenario,
  repeats: number,
  warmupRuns: number
): ScenarioResult {
  const expectedChanges = scenario === 'unchanged' ? 0 : 4;
  const expectedImpactedViews = scenario === 'unchanged' ? 0 : 1;
  const beforeFingerprint = digest(before);
  const afterFingerprint = digest(after);
  let expectedResultFingerprint: string | undefined;
  const samplesMs: number[] = [];
  const run = (timed: boolean): void => {
    const started = performance.now();
    const result = diff(before, after);
    const elapsed = performance.now() - started;
    if (!Array.isArray(result.changes) || result.changes.length !== expectedChanges ||
        result.impactedViewIds.length !== expectedImpactedViews) {
      throw new Error(`Unexpected ${scenario} diff structure for ${tier.name} tier.`);
    }
    const resultFingerprint = digest(result);
    if (expectedResultFingerprint !== undefined && resultFingerprint !== expectedResultFingerprint) {
      throw new Error(`Non-deterministic ${scenario} diff result for ${tier.name} tier.`);
    }
    expectedResultFingerprint = resultFingerprint;
    if (timed) samplesMs.push(elapsed);
  };
  for (let index = 0; index < warmupRuns; index++) run(false);
  for (let index = 0; index < repeats; index++) run(true);
  if (digest(before) !== beforeFingerprint || digest(after) !== afterFingerprint) {
    throw new Error(`The ${scenario} diff operation mutated its ${tier.name} inputs.`);
  }
  const summary = summarizeSamples(samplesMs);
  const classification = classifyPerformance(summary.medianMs, summary.toleranceMs, {
    budgetMs: DTO_DIFF_BUDGETS_MS[tier.name],
    hardLimitMs: DTO_DIFF_HARD_LIMITS_MS[tier.name]
  });
  return { changeCount: expectedChanges, impactedViewCount: expectedImpactedViews,
    measurement: { ...summary, ...classification } };
}

function benchmarkTier(diff: PublicDiff, tier: DtoDiffTier, repeats: number,
  warmupRuns: number): TierResult {
  const fixture = createDtoDiffFixture(tier);
  return {
    tier,
    fixture: {
      provenance: fixture.provenance,
      fixtureVersion: fixture.fixtureVersion,
      elementCount: tier.size,
      relationshipCount: tier.size - 1,
      nodeCount: tier.size,
      connectionCount: tier.size - 1
    },
    fixtureFingerprint: fixture.fixtureFingerprint,
    scenarios: {
      unchanged: measureScenario(diff, fixture.before, fixture.unchangedAfter,
        tier, 'unchanged', repeats, warmupRuns),
      representative: measureScenario(diff, fixture.before, fixture.representativeAfter,
        tier, 'representative', repeats, warmupRuns)
    }
  };
}

export function runDtoDiffBenchmark(
  diff: PublicDiff,
  { repeats = DTO_DIFF_REPEATS, warmupRuns = DTO_DIFF_WARMUP_RUNS }:
  { repeats?: number; warmupRuns?: number } = {}
): DtoDiffBenchmarkResult {
  if (!Number.isInteger(repeats) || repeats < 1 || !Number.isInteger(warmupRuns) || warmupRuns < 0) {
    throw new TypeError('Repeats must be positive and warmup runs must be non-negative integers.');
  }
  const nodeMajor = process.version.replace(/^v/, '').split('.')[0];
  return {
    schemaVersion: DTO_DIFF_BENCHMARK_SCHEMA_VERSION,
    contractVersion: DTO_DIFF_FIXTURE_VERSION,
    provenance: 'SYNTHETIC',
    artifact: {
      format: DTO_DIFF_ARTIFACT_FORMAT,
      createdAt: new Date().toISOString(),
      retentionDays: 30,
      comparisonKey: `node-${nodeMajor}-${process.platform}-${process.arch}`,
      source: {
        repository: process.env.GITHUB_REPOSITORY ?? null,
        revision: process.env.GITHUB_SHA ?? null,
        runId: process.env.GITHUB_RUN_ID ?? null,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null
      }
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: cpus().length,
      ci: process.env.CI === 'true'
    },
    options: { tiers: DTO_DIFF_TIERS.map((tier) => ({ ...tier })), repeats, warmupRuns },
    benchmarks: DTO_DIFF_TIERS.map((tier) => benchmarkTier(diff, tier, repeats, warmupRuns))
  };
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validMeasurement(value: unknown, tier: DtoDiffTierName, repeats: number): boolean {
  if (!record(value) || !exactKeys(value, [ 'samplesMs', 'medianMs', 'medianAbsoluteDeviationMs',
    'toleranceMs', 'budgetMs', 'hardLimitMs', 'budgetStatus', 'hardLimitStatus' ]) ||
      !Array.isArray(value.samplesMs) || value.samplesMs.length !== repeats ||
      !value.samplesMs.every((sample) => typeof sample === 'number' && Number.isFinite(sample) && sample >= 0)) {
    return false;
  }
  const summary = summarizeSamples(value.samplesMs as number[]);
  const expected = classifyPerformance(summary.medianMs, summary.toleranceMs, {
    budgetMs: DTO_DIFF_BUDGETS_MS[tier], hardLimitMs: DTO_DIFF_HARD_LIMITS_MS[tier]
  });
  return value.medianMs === summary.medianMs &&
    value.medianAbsoluteDeviationMs === summary.medianAbsoluteDeviationMs &&
    value.toleranceMs === summary.toleranceMs &&
    value.budgetMs === expected.budgetMs && value.hardLimitMs === expected.hardLimitMs &&
    value.budgetStatus === expected.budgetStatus && value.hardLimitStatus === expected.hardLimitStatus;
}

function validTier(value: unknown, index: number, repeats: number): boolean {
  if (!record(value) || !record(value.tier) || !record(value.fixture) ||
      !record(value.scenarios) || !record(value.scenarios.unchanged) ||
      !record(value.scenarios.representative)) return false;
  const tier = DTO_DIFF_TIERS[index];
  return exactKeys(value, [ 'tier', 'fixture', 'fixtureFingerprint', 'scenarios' ]) &&
    exactKeys(value.tier, [ 'name', 'size' ]) && value.tier.name === tier.name &&
    value.tier.size === tier.size &&
    exactKeys(value.fixture, [ 'provenance', 'fixtureVersion', 'elementCount',
      'relationshipCount', 'nodeCount', 'connectionCount' ]) &&
    value.fixture.provenance === 'SYNTHETIC' && value.fixture.fixtureVersion === DTO_DIFF_FIXTURE_VERSION &&
    value.fixture.elementCount === tier.size && value.fixture.relationshipCount === tier.size - 1 &&
    value.fixture.nodeCount === tier.size && value.fixture.connectionCount === tier.size - 1 &&
    typeof value.fixtureFingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.fixtureFingerprint) &&
    validScenario(value.scenarios.unchanged, 0, 0, tier.name, repeats) &&
    validScenario(value.scenarios.representative, 4, 1, tier.name, repeats);
}

function validScenario(value: Record<string, unknown>, changeCount: number,
  impactedViewCount: number, tier: DtoDiffTierName, repeats: number): boolean {
  return exactKeys(value, [ 'changeCount', 'impactedViewCount', 'measurement' ]) &&
    value.changeCount === changeCount && value.impactedViewCount === impactedViewCount &&
    validMeasurement(value.measurement, tier, repeats);
}

/** Validate the content-free, versioned artifact shape; input DTOs are never accepted here. */
export function validateDtoDiffBenchmarkResult(value: unknown): value is DtoDiffBenchmarkResult {
  if (!record(value) || !record(value.artifact) || !record(value.artifact.source) ||
      !record(value.environment) || !record(value.options) || !Array.isArray(value.benchmarks) ||
      !Array.isArray(value.options.tiers) || !Number.isInteger(value.options.repeats) ||
      !Number.isInteger(value.options.warmupRuns)) return false;
  const repeats = value.options.repeats as number;
  const warmupRuns = value.options.warmupRuns as number;
  const artifact = value.artifact as Record<string, unknown>;
  const source = artifact.source as Record<string, unknown>;
  const environment = value.environment as Record<string, unknown>;
  const options = value.options as Record<string, unknown>;
  const optionTiers = options.tiers as unknown[];
  return exactKeys(value, [ 'schemaVersion', 'contractVersion', 'provenance', 'artifact',
    'environment', 'options', 'benchmarks' ]) && value.schemaVersion === DTO_DIFF_BENCHMARK_SCHEMA_VERSION &&
    value.contractVersion === DTO_DIFF_FIXTURE_VERSION && value.provenance === 'SYNTHETIC' &&
    exactKeys(value.artifact, [ 'format', 'createdAt', 'retentionDays', 'comparisonKey', 'source' ]) &&
    artifact.format === DTO_DIFF_ARTIFACT_FORMAT && typeof artifact.createdAt === 'string' &&
    artifact.retentionDays === 30 && typeof artifact.comparisonKey === 'string' &&
    exactKeys(source, [ 'repository', 'revision', 'runId', 'runAttempt' ]) &&
    [ 'repository', 'revision', 'runId', 'runAttempt' ].every((key) =>
      typeof source[key] === 'string' || source[key] === null) &&
    exactKeys(environment, [ 'node', 'platform', 'arch', 'cpuCount', 'ci' ]) &&
    typeof environment.node === 'string' && typeof environment.platform === 'string' &&
    typeof environment.arch === 'string' && Number.isInteger(environment.cpuCount) &&
    typeof environment.ci === 'boolean' &&
    exactKeys(options, [ 'tiers', 'repeats', 'warmupRuns' ]) && repeats >= 1 &&
    Number.isInteger(warmupRuns) && warmupRuns >= 0 &&
    optionTiers.length === DTO_DIFF_TIERS.length &&
    DTO_DIFF_TIERS.every((tier, index) => {
      const option = optionTiers[index];
      return record(option) && exactKeys(option, [ 'name', 'size' ]) &&
        option.name === tier.name && option.size === tier.size;
    }) && value.benchmarks.length === DTO_DIFF_TIERS.length &&
    value.benchmarks.every((tier, index) => validTier(tier, index, repeats));
}

async function loadPublicDiff(): Promise<PublicDiff> {
  try {
    const modulePath = '../../dist/model-dto/index.js';
    const loaded: unknown = await import(modulePath);
    if (!record(loaded) || typeof loaded.diffModelDto !== 'function') throw new TypeError();
    return loaded.diffModelDto as PublicDiff;
  } catch {
    throw new Error('The public ModelDto build is missing; run "npm run compile:model-dto" first.');
  }
}

function optionValue(prefix: string, fallback: number): number {
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number(value.slice(prefix.length));
  if (!Number.isInteger(parsed)) throw new TypeError(`Expected an integer for ${prefix}.`);
  return parsed;
}

async function main(): Promise<void> {
  const outputOption = process.argv.find((argument) => argument.startsWith('--output='));
  const output = outputOption?.slice('--output='.length) ?? 'test-results/performance-dto-diff.json';
  const result = runDtoDiffBenchmark(await loadPublicDiff(), {
    repeats: optionValue('--repeats=', DTO_DIFF_REPEATS),
    warmupRuns: optionValue('--warmup-runs=', DTO_DIFF_WARMUP_RUNS)
  });
  if (!validateDtoDiffBenchmarkResult(result)) throw new Error('DTO diff artifact failed content-free schema validation.');
  const outputPath = path.resolve(output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  const violations = result.benchmarks.flatMap(({ tier, scenarios }) =>
    (Object.entries(scenarios) as Array<[DtoDiffScenario, ScenarioResult]>)
      .filter(([, value]) => value.measurement.hardLimitStatus === 'exceeded')
      .map(([scenario]) => `${tier.name}/${scenario}`));
  if (process.argv.includes('--assert') && violations.length) {
    throw new Error(`DTO diff hard limit exceeded for ${violations.join(', ')}.`);
  }
  console.log(`DTO diff benchmark passed; content-free artifact: ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
