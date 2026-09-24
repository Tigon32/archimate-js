# Synthetic performance benchmark

This phase-1 harness establishes repeatable scaling evidence for the semantic model path and the view geometry path. Every fixture is generated in memory and is explicitly marked `SYNTHETIC`; it contains no imported model, organization, environment, or customer data.

Build the TypeScript validator once, then run the smoke benchmark:

```bash
npm run compile:validator && node test/performance/benchmark.mjs --smoke --assert
```

For the fuller local run, omit `--smoke` or choose a repeat count:

```bash
npm run compile:validator && node test/performance/benchmark.mjs --repeats=5 --output=/tmp/archimate-performance.json
```

The command writes versioned JSON to stdout (and to `--output=...` when supplied). Results include Node/platform/architecture, fixture sizes, semantic element and relationship counts, diagram node and connection counts, route/layout metrics, and medians for fixture generation, validation, routing, and layout over the requested repeats. `--assert` checks deterministic structural safety conditions only; it does not gate on wall-clock time.

## Provisional phase-1 tiers and budgets

These are planning budgets, not CI pass/fail thresholds. They are intentionally broad until representative hardware and real-world view distributions are available.

| Tier | Synthetic size | Intended use | Provisional local budget |
| --- | ---: | --- | ---: |
| Smoke | 4–9 nodes; 8–18 semantic elements | Pull-request sanity and developer feedback | Complete without routing-grid errors; no semantic diagnostics |
| Small | 9–25 nodes; 18–50 semantic elements | Routine local regression sampling | Median of each operation remains below 1 s on a modern developer machine |
| Medium | 49 nodes; 98 semantic elements | Periodic scaling check | Median of each operation remains below 10 s on a modern developer machine |

The budgets are guidance for investigation, not fragile timing assertions. Changes should first be compared using the structured medians and route/layout metrics, then profiled if a tier changes materially. CI should use the smoke assertion mode rather than a wall-clock gate.

## Result contract

The top-level `schemaVersion` is currently `1`. A result is valid only when top-level and fixture provenance is `SYNTHETIC`, semantic validation succeeds with zero errors, generated counts match the validator summary, and every generated connection is routed. Fixture fingerprints help detect accidental changes to the deterministic input shape.
