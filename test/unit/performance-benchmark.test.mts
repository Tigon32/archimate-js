import { describe, expect, it } from 'vitest';

import {
  BENCHMARK_SCHEMA_VERSION,
  createSyntheticFixtures,
  validateBenchmarkResult
} from '../performance/benchmark.mjs';

function expectSyntheticFixtureShape(): void {
  const first = createSyntheticFixtures(9);
  expect(first.provenance).toBe('SYNTHETIC');
  expect(first.semantic.elementCount).toBe(18);
  expect(first.semantic.relationshipCount).toBe(9);
  expect(first.diagram.nodeCount).toBe(9);
  expect(first.diagram.connectionCount).toBe(8);
  expect(first.semantic.xml).not.toMatch(/@|https?:\/\/(?!www\.w3\.org\/)/);
}

function createValidResult() {
  return {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      provenance: 'SYNTHETIC',
      environment: { node: 'v-test' },
      benchmarks: [{
        fixture: {
          size: 1,
          provenance: 'SYNTHETIC',
          semantic: { elementCount: 2, relationshipCount: 1 },
          diagram: { nodeCount: 1, connectionCount: 0 }
        },
        repeats: 1,
        fixtureFingerprint: 'a'.repeat(64),
        mediansMs: {
          semanticGenerationMs: 0,
          semanticValidationMs: 0,
          diagramGenerationMs: 0,
          routingMs: 0,
          layoutMs: 0
        },
        metrics: {
          semantic: {
            valid: true,
            errorCount: 0,
            summaryElementCount: 2,
            summaryRelationshipCount: 1,
            generatedElementCount: 2,
            generatedRelationshipCount: 1
          },
          diagram: {
            generatedNodeCount: 1,
            generatedConnectionCount: 0,
            routedConnectionCount: 0
          }
        }
      }]
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
    }]
  })).toBe(false);
  expect(validateBenchmarkResult({
    ...result,
    benchmarks: [{ ...result.benchmarks[0], fixtureFingerprint: undefined }]
  })).toBe(false);
}

describe('synthetic performance benchmark foundation', () => {
  it('generates stable, synthetic semantic and diagram fixtures', () => {
    expect(createSyntheticFixtures(9)).toEqual(createSyntheticFixtures(9));
    expectSyntheticFixtureShape();
  });

  it('accepts the versioned result shape and rejects invalid variants', () => {
    const result = createValidResult();
    expectValidResult(result);
    expectInvalidResultVariants(result);
  });
});
