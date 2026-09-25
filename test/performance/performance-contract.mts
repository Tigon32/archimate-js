export type TierName = 'small' | 'medium' | 'large';
export type NodeMeasurementKey =
  | 'semanticGenerationMs'
  | 'semanticValidationMs'
  | 'diagramGenerationMs'
  | 'routingMs'
  | 'layoutMs';

export type PerformanceTier = Readonly<{
  name: TierName;
  size: number;
}>;

export type TimingSummary = {
  samplesMs: number[];
  medianMs: number;
  medianAbsoluteDeviationMs: number;
  toleranceMs: number;
};

export type PerformanceClassification = {
  budgetMs: number;
  hardLimitMs: number;
  budgetStatus: 'within' | 'exceeded';
  hardLimitStatus: 'within' | 'exceeded';
};

export const PERFORMANCE_CONTRACT_VERSION = 1;
export const ARTIFACT_RETENTION_DAYS = 30;
export const PERFORMANCE_TIERS: readonly PerformanceTier[] = Object.freeze([
  Object.freeze({ name: 'small', size: 25 }),
  Object.freeze({ name: 'medium', size: 64 }),
  Object.freeze({ name: 'large', size: 144 })
]);

export const NODE_MEASUREMENT_KEYS: readonly NodeMeasurementKey[] = Object.freeze([
  'semanticGenerationMs',
  'semanticValidationMs',
  'diagramGenerationMs',
  'routingMs',
  'layoutMs'
]);

type NodeThresholds = Record<NodeMeasurementKey, number>;
type TierThresholds = Record<TierName, NodeThresholds>;

export const PERFORMANCE_BUDGETS: Readonly<{
  node: TierThresholds;
  browser: Record<TierName, number>;
}> = Object.freeze({
  node: Object.freeze({
    small: Object.freeze({
      semanticGenerationMs: 25,
      semanticValidationMs: 100,
      diagramGenerationMs: 25,
      routingMs: 100,
      layoutMs: 250
    }),
    medium: Object.freeze({
      semanticGenerationMs: 50,
      semanticValidationMs: 250,
      diagramGenerationMs: 50,
      routingMs: 500,
      layoutMs: 1000
    }),
    large: Object.freeze({
      semanticGenerationMs: 100,
      semanticValidationMs: 750,
      diagramGenerationMs: 100,
      routingMs: 3000,
      layoutMs: 3000
    })
  }),
  browser: Object.freeze({ small: 2000, medium: 4000, large: 7000 })
});

export const PERFORMANCE_HARD_LIMITS: Readonly<{
  node: TierThresholds;
  browser: Record<TierName, number>;
}> = Object.freeze({
  node: Object.freeze({
    small: Object.freeze({
      semanticGenerationMs: 250,
      semanticValidationMs: 1000,
      diagramGenerationMs: 250,
      routingMs: 1500,
      layoutMs: 3000
    }),
    medium: Object.freeze({
      semanticGenerationMs: 500,
      semanticValidationMs: 2500,
      diagramGenerationMs: 500,
      routingMs: 5000,
      layoutMs: 8000
    }),
    large: Object.freeze({
      semanticGenerationMs: 1000,
      semanticValidationMs: 5000,
      diagramGenerationMs: 1000,
      routingMs: 12000,
      layoutMs: 20000
    })
  }),
  browser: Object.freeze({ small: 8000, medium: 15000, large: 25000 })
});

export function median(values: readonly number[]): number {
  if (!values.length) throw new TypeError('Cannot calculate a median of no values');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeSamples(samples: readonly number[]): TimingSummary {
  if (samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new TypeError('Performance samples must be finite non-negative numbers');
  }
  const medianMs = median(samples);
  const medianAbsoluteDeviationMs = median(samples.map((sample) => Math.abs(sample - medianMs)));
  return {
    samplesMs: [...samples],
    medianMs,
    medianAbsoluteDeviationMs,
    toleranceMs: Math.max(1, medianMs * 0.25, medianAbsoluteDeviationMs * 3)
  };
}

export function classifyPerformance(
  medianMs: number,
  toleranceMs: number,
  thresholds: { budgetMs: number; hardLimitMs: number }
): PerformanceClassification {
  return {
    ...thresholds,
    budgetStatus: medianMs <= thresholds.budgetMs ? 'within' : 'exceeded',
    hardLimitStatus: medianMs - toleranceMs <= thresholds.hardLimitMs ? 'within' : 'exceeded'
  };
}

export function artifactMetadata(kind: 'node' | 'browser', comparisonKey: string) {
  return {
    kind,
    format: 'archimate-js.performance/v2',
    createdAt: new Date().toISOString(),
    retentionDays: ARTIFACT_RETENTION_DAYS,
    comparisonKey,
    source: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      revision: process.env.GITHUB_SHA ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null
    }
  };
}
