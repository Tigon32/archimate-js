export type DtoDiffTierName = 'small' | 'medium' | 'large';
export type DtoDiffTier = Readonly<{ name: DtoDiffTierName; size: number }>;
export type DtoDiffScenario = 'unchanged' | 'representative';

export const DTO_DIFF_FIXTURE_VERSION = 1;
export const DTO_DIFF_BENCHMARK_SCHEMA_VERSION = 1;
export const DTO_DIFF_ARTIFACT_FORMAT = 'archimate-js.dto-diff-performance/v1';
export const DTO_DIFF_REPEATS = 9;
export const DTO_DIFF_WARMUP_RUNS = 2;

export const DTO_DIFF_TIERS: readonly DtoDiffTier[] = Object.freeze([
  Object.freeze({ name: 'small', size: 100 }),
  Object.freeze({ name: 'medium', size: 1000 }),
  Object.freeze({ name: 'large', size: 5000 })
]);

export const DTO_DIFF_BUDGETS_MS: Readonly<Record<DtoDiffTierName, number>> = Object.freeze({
  small: 10,
  medium: 75,
  large: 350
});

export const DTO_DIFF_HARD_LIMITS_MS: Readonly<Record<DtoDiffTierName, number>> = Object.freeze({
  small: 100,
  medium: 500,
  large: 2000
});
