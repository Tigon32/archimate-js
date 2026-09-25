// SYNTHETIC: Benchmark fixtures and results use invented IDs and labels.
import { expect, it } from 'vitest';
import { diffModelDto } from '../../src/model-dto/index.js';
import {
  DTO_DIFF_ARTIFACT_FORMAT,
  DTO_DIFF_BENCHMARK_SCHEMA_VERSION,
  DTO_DIFF_BUDGETS_MS,
  DTO_DIFF_FIXTURE_VERSION,
  DTO_DIFF_HARD_LIMITS_MS,
  DTO_DIFF_TIERS,
  type DtoDiffTierName
} from '../performance/dto-diff-contract.mts';
import { createDtoDiffFixture } from '../performance/dto-diff-fixtures.mts';
import { validateDtoDiffBenchmarkResult } from '../performance/dto-diff-benchmark.mts';
import { classifyPerformance, summarizeSamples } from '../performance/performance-contract.mts';

function measurement(tier: DtoDiffTierName) {
  const summary = summarizeSamples([ 2, 3, 4 ]);
  return {
    ...summary,
    ...classifyPerformance(summary.medianMs, summary.toleranceMs, {
      budgetMs: DTO_DIFF_BUDGETS_MS[tier], hardLimitMs: DTO_DIFF_HARD_LIMITS_MS[tier]
    })
  };
}

function validArtifact() {
  return {
    schemaVersion: DTO_DIFF_BENCHMARK_SCHEMA_VERSION,
    contractVersion: DTO_DIFF_FIXTURE_VERSION,
    provenance: 'SYNTHETIC',
    artifact: {
      format: DTO_DIFF_ARTIFACT_FORMAT,
      createdAt: '2026-09-26T00:00:00.000Z',
      retentionDays: 30,
      comparisonKey: 'node-24-linux-x64',
      source: { repository: null, revision: null, runId: null, runAttempt: null }
    },
    environment: { node: 'v24.21.0', platform: 'linux', arch: 'x64', cpuCount: 2, ci: true },
    options: { tiers: DTO_DIFF_TIERS, repeats: 3, warmupRuns: 2 },
    benchmarks: DTO_DIFF_TIERS.map((tier) => ({
      tier,
      fixture: {
        provenance: 'SYNTHETIC', fixtureVersion: DTO_DIFF_FIXTURE_VERSION,
        elementCount: tier.size, relationshipCount: tier.size - 1,
        nodeCount: tier.size, connectionCount: tier.size - 1
      },
      fixtureFingerprint: 'a'.repeat(64),
      scenarios: {
        unchanged: { changeCount: 0, impactedViewCount: 0, measurement: measurement(tier.name) },
        representative: { changeCount: 4, impactedViewCount: 1, measurement: measurement(tier.name) }
      }
    }))
  };
}

it('generates versioned, deterministic synthetic DTO pairs with exact tier sizes', () => {
  const first = createDtoDiffFixture(DTO_DIFF_TIERS[0]);
  const second = createDtoDiffFixture(DTO_DIFF_TIERS[0]);
  expect(first).toEqual(second);
  expect(first.fixtureVersion).toBe(DTO_DIFF_FIXTURE_VERSION);
  expect(first.provenance).toBe('SYNTHETIC');
  expect(first.before.elements).toHaveLength(100);
  expect(first.before.relationships).toHaveLength(99);
  expect(first.before.views[0].nodes).toHaveLength(100);
  expect(first.before.views[0].connections).toHaveLength(99);
  expect(first.fixtureFingerprint).toMatch(/^[a-f0-9]{64}$/);
});

it('classifies exact semantic and presentation changes without mutating inputs', () => {
  const { before, unchangedAfter, representativeAfter } = createDtoDiffFixture(DTO_DIFF_TIERS[0]);
  const beforeJson = JSON.stringify(before);
  const unchangedJson = JSON.stringify(unchangedAfter);
  const changedJson = JSON.stringify(representativeAfter);
  expect(diffModelDto(before, unchangedAfter)).toMatchObject({ changes: [], impactedViewIds: [] });
  const diff = diffModelDto(before, representativeAfter);
  expect(diff.changes.map(({ area, entity, kind, changedFields }) =>
    [ area, entity, kind, changedFields ])).toEqual([
    [ 'presentation', 'connection', 'modified', [ 'waypoints' ] ],
    [ 'presentation', 'node', 'modified', [ 'x' ] ],
    [ 'semantic', 'element', 'modified', [ 'name' ] ],
    [ 'semantic', 'relationship', 'modified', [ 'type' ] ]
  ]);
  expect(diff.impactedViewIds).toEqual([ 'synthetic-view' ]);
  expect(diffModelDto(before, representativeAfter)).toEqual(diff);
  expect(JSON.stringify(before)).toBe(beforeJson);
  expect(JSON.stringify(unchangedAfter)).toBe(unchangedJson);
  expect(JSON.stringify(representativeAfter)).toBe(changedJson);
});

it('validates the versioned content-free artifact and rejects payload fields', () => {
  const result = validArtifact();
  expect(validateDtoDiffBenchmarkResult(result)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('Synthetic process');
  expect(validateDtoDiffBenchmarkResult({ ...result, dto: createDtoDiffFixture(DTO_DIFF_TIERS[0]).before }))
    .toBe(false);
  expect(validateDtoDiffBenchmarkResult({
    ...result,
    benchmarks: result.benchmarks.map((entry, index) => index === 0
      ? { ...entry, fixture: { ...entry.fixture, names: [ 'Synthetic process 0' ] } }
      : entry)
  })).toBe(false);
});
