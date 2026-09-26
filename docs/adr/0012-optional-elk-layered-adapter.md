# ADR-0012: Use ELK Layered behind an optional compound-layout adapter

Date: 2026-09-26
Updated: 2026-09-26
Status: Accepted

Implementation status: #382 adds the exact-version optional adapter for
unlabeled views; labeled edges return a deterministic unsupported diagnostic
until the editor has a reversible renderer-consumable label-geometry contract.

## Context

The engine-neutral layout API (#383) needs an optional compound strategy for
#382. The `elkjs` license review in [docs/research/elkjs-license-and-provenance.md](../research/elkjs-license-and-provenance.md)
supports the EPL-2.0 distribution path recorded in the repository's adoption
notice and provenance. The synthetic feasibility spike in
[docs/research/elkjs-layout-spike-2026-09-26.md](../research/elkjs-layout-spike-2026-09-26.md)
tested compound children, cross-hierarchy edges, fixed-side ports, labels,
deterministic output, and reversible geometry snapshots using version 0.12.0.

## Decision

- Select `elkjs@0.12.0` as the initial engine candidate for the explicitly
  selected `elk-layered` strategy. Pin that version exactly for the first
  integration; upgrades require repeatability and compatibility tests.
- Keep the engine isolated behind `src/layout`. Preserve ModelDto authority,
  expose geometry through reversible patches, and return explicit failures;
  never silently fall back to the built-in strategy.
- Enable top-level compound hierarchy handling, map nested coordinates to
  the DTO view coordinate convention, and use configured minimum-size
  constraints when authored container bounds must not shrink.
- Do not drop ELK edge-label output. Until a reversible renderer-consumable
  label-geometry contract exists, reject a labeled view with a stable
  `UNSUPPORTED_CONSTRAINT` diagnostic and no partial patch/result. The strategy
  is enabled only for views whose edges have no labels.
- Support explicit first/last rank requests through ELK's Layered
  `layerConstraint`; reject unsatisfied rank requests without a partial result.
- Use the selected EPL-2.0 path for the exact runtime dependency. The
  repository records its provenance and ships the EPL-2.0 text; the
  GPL-3.0-or-later secondary-license option remains declined, as documented
  in the license review.
- Keep worker execution and performance claims outside this decision; #386
  must evaluate browser worker integration and #385 must measure layout
  quality on a synthetic corpus.

## Consequences

- The unlabeled-view integration uses ModelDto geometry, orthogonal routes,
  and reversible patches. Labeled views remain gated on a renderer-consumable
  label-geometry contract.
- The spike establishes API-level feasibility for one small graph only. It
  makes no claim about large models, all graph topologies, performance, or
  browser distribution.
- #354's decision is recorded; #382 may proceed against these constraints.

## References

- [ELK Layered reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
- [ELK node-size constraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-nodeSize-constraints.html)
- [ELK Layer Constraint](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-layering-layerConstraint.html)
- [ELK.js licensing and provenance research](../research/elkjs-license-and-provenance.md)
- [ELK.js Layered feasibility spike](../research/elkjs-layout-spike-2026-09-26.md)
