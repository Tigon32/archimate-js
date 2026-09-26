# Layout quality measurement

The layout-quality tooling for #385 measures presentation geometry only. It
does not change ArchiMate semantics and the synthetic scores are not normative
ArchiMate conformance evidence.

Run the comparison locally with:

```sh
npm run layout:quality -- --output=artifacts/layout-quality
```

The output directory is gitignored and contains:

- `corpus.json` with SYNTHETIC corpus metadata and coverage tags;
- `metrics.json` with one record per corpus case and strategy;
- deterministic SVG snapshots for successful strategy runs.

CI runs the same command in the primary qualification job and uploads
`artifacts/layout-quality/` as part of the pinned
`primary-qualification-evidence` artifact. These SVG files are generated at CI
time rather than committed.

## Raw metrics

`src/layout/quality-metrics.ts` reports raw metrics alongside an optional
weighted score:

- node overlaps and containment violations;
- edge/node intersections, edge crossings, and shared positive-length
  segments;
- total bends, maximum bends per edge, total edge length, and mean edge length;
- label overlaps against other labels and non-owner nodes;
- layout width and height;
- moved nodes, total/mean node movement, and unaffected-node displacement for
  incremental comparisons;
- hard-pin violations, soft-pin displacement, and aggregate violated
  constraints;
- duration in milliseconds.

`durationMs` is runtime-sensitive and must be excluded from deterministic
comparisons. Use `deterministicQualityMetrics` for snapshot-style comparisons.
The weighted score is version-local convenience data for comparing the two
strategies on this corpus; consumers should retain and interpret the raw
metrics for their own priorities.

## SYNTHETIC corpus provenance

`src/layout/quality-corpus.ts` generates all corpus cases in code. Every case is
marked `SYNTHETIC`, uses generic concept names, and contains no private model,
customer, host, cost, control, or environment data. The current corpus covers:

- nested groups and cross-hierarchy edges;
- cycles, multi-edges, and self-loops;
- node labels;
- pinned nodes;
- dense views.

The corpus is intentionally small enough for deterministic CI execution. It is
a regression and comparison harness, not a representative sample of real
architecture models.

## Determinism boundary

For fixed DTO input, selected strategy, strategy version, options, and seed, the
geometry, raw metrics except `durationMs`, and generated SVG snapshots must be
stable. The optional `elk-layered` strategy remains subject to ADR-0012: views
with unsupported constraints return explicit diagnostics and no silent fallback.
