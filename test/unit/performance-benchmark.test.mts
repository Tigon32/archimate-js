import { describe, expect, it } from 'vitest';

import {
  BENCHMARK_SCHEMA_VERSION,
  createSyntheticFixtures,
  validateBenchmarkResult
} from '../performance/benchmark.mjs';
import {
  PERFORMANCE_TIERS,
  classifyPerformance,
  summarizeSamples
} from '../performance/performance-contract.mts';
import { createSyntheticModel } from '../performance/synthetic-model.mts';

function expectSyntheticFixtureShape(): void {
  const first = createSyntheticFixtures(9);
  expect(first.provenance).toBe('SYNTHETIC');
  expect(first.semantic.elementCount).toBe(9);
  expect(first.semantic.relationshipCount).toBe(8);
  expect(first.diagram.nodeCount).toBe(9);
  expect(first.diagram.connectionCount).toBe(8);
  expect(first.semantic.xml).not.toContain('@');
}

function createValidResult() {
  const measurement = {
    samplesMs: [ 1 ],
    medianMs: 1,
    medianAbsoluteDeviationMs: 0,
    toleranceMs: 1,
    budgetMs: 100,
    hardLimitMs: 1000,
    budgetStatus: 'within',
    hardLimitStatus: 'within'
  };
  return {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      contractVersion: 1,
      provenance: 'SYNTHETIC',
      mode: 'smoke',
      artifact: {
        kind: 'node',
        format: 'archimate-js.performance/v2',
        createdAt: '2026-09-25T00:00:00.000Z',
        retentionDays: 30,
        comparisonKey: 'node-test',
        source: { repository: null, revision: null, runId: null, runAttempt: null }
      },
      environment: { node: 'v-test' },
      options: { tiers: PERFORMANCE_TIERS, repeats: 1 },
      benchmarks: PERFORMANCE_TIERS.map((tier) => ({
        tier,
        fixture: {
          provenance: 'SYNTHETIC',
          semantic: { elementCount: tier.size, relationshipCount: tier.size - 1, xmlBytes: 1 },
          diagram: { nodeCount: tier.size, connectionCount: tier.size - 1 }
        },
        repeats: 1,
        fixtureFingerprint: 'a'.repeat(64),
        measurements: {
          semanticGenerationMs: measurement,
          semanticValidationMs: measurement,
          diagramGenerationMs: measurement,
          routingMs: measurement,
          layoutMs: measurement
        },
        metrics: {
          semantic: {
            valid: true,
            errorCount: 0,
            summaryElementCount: tier.size,
            summaryRelationshipCount: tier.size - 1
          },
          diagram: {
            routedConnectionCount: tier.size - 1
          }
        }
      }))
  };
}

function expectValidResult(result: ReturnType<typeof createValidResult>): void {
  expect(validateBenchmarkResult(result)).toBe(true);
}

function expectInvalidResultVariants(result: ReturnType<typeof createValidResult>): void {
  expect(validateBenchmarkResult({ ...result, provenance: 'PUBLIC' })).toBe(false);
  expect(validateBenchmarkResult({
    ...result,
    benchmarks: [{ ...result.benchmarks[0], metrics: undefined }]
  })).toBe(false);
  expect(validateBenchmarkResult({
    ...result,
    benchmarks: [{
      ...result.benchmarks[0],
      fixture: { ...result.benchmarks[0].fixture, diagram: { nodeCount: 2, connectionCount: 0 } }
    }, ...result.benchmarks.slice(1)]
  })).toBe(false);
  expect(validateBenchmarkResult({
    ...result,
    benchmarks: [
      { ...result.benchmarks[0], fixtureFingerprint: undefined },
      ...result.benchmarks.slice(1)
    ]
  })).toBe(false);
}

describe('synthetic performance benchmark foundation', () => {
  it('generates stable, synthetic semantic and diagram fixtures', () => {
    expect(createSyntheticFixtures(9)).toEqual(createSyntheticFixtures(9));
    expectSyntheticFixtureShape();
  });

  it('generates deterministic small, medium, and large browser models', () => {
    expect(PERFORMANCE_TIERS.map(({ name }) => name)).toEqual([ 'small', 'medium', 'large' ]);
    for (const tier of PERFORMANCE_TIERS) {
      const first = createSyntheticModel(tier);
      const second = createSyntheticModel(tier);
      expect(first).toEqual(second);
      expect(first.provenance).toBe('SYNTHETIC');
      expect(first.nodeCount).toBe(tier.size);
      expect(first.connectionCount).toBe(tier.size - 1);
      expect(first.xml).toContain(`identifier="synthetic-model-${tier.name}"`);
    }
  });

  it('uses median and median absolute deviation for low-noise tolerance', () => {
    expect(summarizeSamples([ 10, 11, 12, 13, 90 ])).toEqual({
      samplesMs: [ 10, 11, 12, 13, 90 ],
      medianMs: 12,
      medianAbsoluteDeviationMs: 1,
      toleranceMs: 3
    });
  });

  it('reports advisory budget regressions without failing below the hard limit', () => {
    expect(classifyPerformance(120, 10, { budgetMs: 100, hardLimitMs: 500 })).toEqual({
      budgetMs: 100,
      hardLimitMs: 500,
      budgetStatus: 'exceeded',
      hardLimitStatus: 'within'
    });
    expect(classifyPerformance(520, 10, { budgetMs: 100, hardLimitMs: 500 }).hardLimitStatus)
      .toBe('exceeded');
  });

  it('accepts the versioned result shape and rejects invalid variants', () => {
    const result = createValidResult();
    expectValidResult(result);
    expectInvalidResultVariants(result);
  });
});
