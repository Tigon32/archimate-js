# ADR-0012: Use ELK Layered behind an optional compound-layout adapter

Date: 2026-09-26
Status: Accepted

## Context

The engine-neutral layout API (#383) needs an optional compound strategy for
#382. The `elkjs` license review in [docs/research/elkjs-license-and-provenance.md](../research/elkjs-license-and-provenance.md)
supports an EPL-2.0 distribution path, subject to adding notices and
provenance before dependency adoption. The synthetic feasibility spike in
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
- Resolve the layout DTO's missing edge-label position before enabling the
  strategy: map the engine's label output into renderer-consumable route
  geometry or extend the reversible patch contract. Do not drop label output.
- Add the selected EPL-2.0 notice and package provenance before adding ELK as
  a runtime dependency. The GPL-3.0-or-later secondary-license option remains
  declined, as documented in the license review.
- Keep worker execution and performance claims outside this decision; #386
  must evaluate browser worker integration and #385 must measure layout
  quality on a synthetic corpus.

## Consequences

- The upstream engine is a feasible candidate, while the integration remains
  gated on label mapping, provenance notices, and real patch reversibility.
- The spike establishes API-level feasibility for one small graph only. It
  makes no claim about large models, all graph topologies, performance, or
  browser distribution.
- #354's decision is recorded; #382 may proceed against these constraints.

## References

- [ELK Layered reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
- [ELK node-size constraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-nodeSize-constraints.html)
- [ELK.js licensing and provenance research](../research/elkjs-license-and-provenance.md)
- [ELK.js Layered feasibility spike](../research/elkjs-layout-spike-2026-09-26.md)
