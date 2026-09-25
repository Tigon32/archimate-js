# Synthetic ModelDto diff performance

`npm run test:performance:dto-diff` measures only the public
`diffModelDto(before, after)` API exported by `archimate-js/model-dto`. It
does not measure XML import, CLI work, SVG overlays, rendering, editing, or
memory use. Generated DTOs are marked `SYNTHETIC`; artifacts contain counts and
SHA-256 fingerprints, never DTO names, IDs, documentation, or model content.

## Versioned tiers and cases

Fixture schema version 1 generates one view per model. Each tier has `N`
elements, `N-1` relationships, `N` view nodes, and `N-1` connections.

| Tier | Elements | Relationships | Nodes | Connections |
| --- | ---: | ---: | ---: | ---: |
| Small | 100 | 99 | 100 | 99 |
| Medium | 1,000 | 999 | 1,000 | 999 |
| Large | 5,000 | 4,999 | 5,000 | 4,999 |

Each tier measures two pairs: an unchanged clone (zero changes, zero impacted
views) and a representative pair with one element-name change, one
relationship-type change, one node-position change, and one connection-route
change (four change records and one impacted view). Each operation runs twice
for warmup, then nine timed repetitions. Fixture generation and result
fingerprinting are outside the timed interval. The harness verifies
deterministic results and unchanged inputs on every run.

## Calibration and limits

Two independent calibration runs used Node v24.21.0 on macOS arm64. Each used
two warmups and nine samples per scenario. Values below are median milliseconds
with MAD in parentheses; exact raw samples, tolerance, counts, environment,
and fixture fingerprints are included in the versioned CI artifact.

| Tier | Unchanged run 1 | Unchanged run 2 | Representative run 1 | Representative run 2 | Budget | Hard limit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 3.05 (0.10) | 3.09 (0.09) | 2.97 (0.10) | 3.08 (0.05) | 10 | 100 |
| Medium | 28.97 (0.69) | 29.43 (1.09) | 28.47 (0.22) | 29.31 (0.50) | 75 | 500 |
| Large | 145.17 (1.54) | 146.78 (0.78) | 144.02 (0.46) | 145.36 (2.49) | 350 | 2,000 |

Budgets are intentionally above the repeated local medians to allow for
shared-runner and platform variation. Budget overruns are reported for review
but do not fail CI. A tier fails only when `median - tolerance` exceeds its
hard limit. Tolerance uses the repository formula:
`max(1 ms, median * 25%, MAD * 3)`. Hard limits are broad regression boundaries,
not service-level promises. Compare artifacts only when the format, fixture
fingerprint, tier, comparison key, and measurement match.

## Artifact and command

The benchmark writes `test-results/performance-dto-diff.json` in format
`archimate-js.dto-diff-performance/v1`. CI retains it with the other primary
qualification evidence. It includes all timed samples and both scenarios for
each tier; its strict schema allows only tier counts, fingerprints, statistics,
and runtime/workflow metadata.

```bash
npm run test:performance:dto-diff
```

To collect more calibration samples locally, after compiling the public DTO
entry point:

```bash
npm run compile:model-dto
node test/performance/dto-diff-benchmark.mts --repeats=15 \
  --warmup-runs=3 --output=test-results/performance-dto-diff.json
```
