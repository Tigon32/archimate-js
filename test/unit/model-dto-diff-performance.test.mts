// SYNTHETIC: Runtime-sensitive budget test uses generated DTOs with invented IDs and labels only.
// @ts-expect-error Node types are excluded from the application TypeScript project.
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import { diffModelDto } from '../../src/model-dto/index.js';
import {
  DTO_DIFF_BUDGETS_MS,
  DTO_DIFF_HARD_LIMITS_MS,
  DTO_DIFF_TIERS
} from '../performance/dto-diff-contract.mts';
import { createDtoDiffFixture } from '../performance/dto-diff-fixtures.mts';
import { classifyPerformance, summarizeSamples } from '../performance/performance-contract.mts';

describe('runtime-sensitive DTO diff performance budget', () => {
  it('keeps the synthetic large-model representative diff under the hard limit', () => {
    const tier = DTO_DIFF_TIERS.find(({ name }) => name === 'large');
    if (!tier) throw new Error('missing large DTO diff tier');
    const fixture = createDtoDiffFixture(tier);
    const samples = Array.from({ length: 3 }, () => {
      const started = performance.now();
      const result = diffModelDto(fixture.before, fixture.representativeAfter);
      expect(result.changes).toHaveLength(4);
      expect(result.impactedViewIds).toEqual(['synthetic-view']);
      return performance.now() - started;
    });
    const summary = summarizeSamples(samples);
    const status = classifyPerformance(summary.medianMs, summary.toleranceMs, {
      budgetMs: DTO_DIFF_BUDGETS_MS.large,
      hardLimitMs: DTO_DIFF_HARD_LIMITS_MS.large
    });
    expect(status.hardLimitStatus).toBe('within');
  });
});
