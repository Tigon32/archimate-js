# Synthetic performance benchmark

This phase-1 harness establishes repeatable scaling evidence for the semantic model path and the view geometry path. Every fixture is generated in memory and is explicitly marked `SYNTHETIC`; it contains no imported model, organization, environment, or customer data.

Build the TypeScript validator once, then run the smoke benchmark:

```bash
npm run compile:validator && node test/performance/benchmark.mts --smoke --assert
```

For the fuller local run, omit `--smoke` or choose a repeat count:

```bash
npm run compile:validator && node test/performance/benchmark.mts --repeats=5 --output=/tmp/archimate-performance.json
```

The command writes versioned JSON to stdout (and to `--output=...` when supplied). Results include Node/platform/architecture, fixture sizes, semantic element and relationship counts, diagram node and connection counts, route/layout metrics, and medians for fixture generation, validation, routing, and layout over the requested repeats. `--assert` checks deterministic structural safety conditions only; it does not gate on wall-clock time.

## CI artifacts and comparison

The CI **Verify on Node.js 22** and **Verify on Node.js 24** jobs compile once, then run
`node test/performance/benchmark.mts --smoke --assert --output=performance-baseline-node-<major>.json`.
The same jobs upload `performance-baseline-node-22` and
`performance-baseline-node-24` as separate artifacts after a successful assertion.
In a pull request or main branch run, open **Actions → CI → the run → Artifacts**
and download the artifact for the Node version being investigated. Artifacts
are retained for 30 days. A failed semantic or routing assertion fails the
verify job; a successful run retains its JSON file. No second full test suite
is run for this baseline.

The JSON uses `schemaVersion: 1`. It includes top-level `provenance:
"SYNTHETIC"`, `mode: "smoke"`, `environment` (Node version, platform,
architecture, CPU count and CI flag), `options` (sizes and repeat count),
and one `benchmarks[]` entry per synthetic size. Each entry records fixture
provenance and semantic/diagram counts, a SHA-256 `fixtureFingerprint`,
`metrics.semantic` and `metrics.diagram` for validation and routing/layout,
and `mediansMs` for generation, validation, routing and layout. The smoke
mode measures sizes 4 and 9 with two repeats by default.

Compare artifacts from the **same Node major** and the same `schemaVersion`,
`options`, sizes and fixture fingerprints. For example, after extracting
two Node 24 artifacts:

```bash
jq -r '.benchmarks[] | [.fixture.size, .fixtureFingerprint, .mediansMs.semanticValidationMs, .mediansMs.routingMs, .mediansMs.layoutMs] | @tsv' baseline/performance-baseline-node-24.json
jq -r '.benchmarks[] | [.fixture.size, .fixtureFingerprint, .mediansMs.semanticValidationMs, .mediansMs.routingMs, .mediansMs.layoutMs] | @tsv' candidate/performance-baseline-node-24.json
```

If a median changes materially, first check the fingerprint, counts, route and
layout metrics, Node version, architecture and CPU count. Then repeat the
benchmark on the same machine or compare several CI runs before profiling
the affected operation. Shared CI runners, JIT warmup and two-repeat samples
make individual wall-clock medians noisy; results are diagnostic scaling
evidence, not a numeric regression gate or a substitute for browser rendering,
memory, larger-tier, or real-model measurements.

## Browser render baseline

The browser CI job also runs the read-only synthetic showcase three times in
fresh Chromium contexts and uploads `performance-baseline-browser` (JSON) for
30 days. Locally, after `npm run compile`, run:

```bash
CHROME_BIN=/path/to/chromium node test/performance/browser-benchmark.mts --output=test-results/performance-baseline-browser.json
```

The `navigation-init-to-rendered-svg` timer starts in a document init script
and stops when the example reports success and has at least five shapes and
four connections. It includes document load, local fixture fetch, bundle
startup, model import, and first SVG mount. Browser launch and context creation
are outside the timer. The runner asserts SVG shape, connection, and text
counts, equal counts across repeats, no page errors, and no off-origin requests.
Its output contains only a SHA-256 digest of the synthetic fixture, three
timings, their median, structural counts, and runtime metadata; it does not
embed XML or page content. This benchmark uses the read-only example's shared
MEFF source and serves both the ArchiMateJS and model DTO browser bundles. Its
fixture hash therefore changes when the example's shared model changes. Compare
runs only with the same fixture hash, schema, Chromium major version, and
comparable runner environment.

Timings are observational: CI host contention, cold asset loading, browser
version, and the small sample count add noise. This is one small view with an
automatic read-only mount; it does not measure interactive editing, peak
memory, larger views, cancellation, or SVG raster/pixel quality. The numeric
budgets and scaling decisions remain in #107.

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
