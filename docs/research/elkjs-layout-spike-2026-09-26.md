# ELK.js Layered feasibility spike (#354)

Date: 2026-09-26
Package tested: `elkjs@0.12.0`
Runtime: Node.js 24.21.0
Fixture provenance: hand-authored `SYNTHETIC` graph in `test/spikes/elk-layered-layout.mts`.

## Decision

Accept ELK Layered as the engine candidate for the optional `elk-layered`
strategy in #382. Do not add it as a dependency until the integration adds the
EPL-2.0 notice and provenance entry described in the [license review](elkjs-license-and-provenance.md).
Keep it behind the engine-neutral `src/layout` API, explicitly selected, and
fail with diagnostics rather than silently falling back.

Before enabling the strategy, its adapter must convert nested ELK coordinates
to the DTO coordinate convention, preserve authored minimum sizes, map edge
sections to reversible waypoints, and account for ELK's edge-label geometry.
`ViewConnectionDto` stores a label string and route waypoints but no explicit
label position. The adapter must either encode label placement in route
waypoints as the renderer expects, or extend the DTO patch contract with
reversible label geometry. It must not silently discard ELK's label output.

The initial integration should pin `elkjs@0.12.0` exactly and test an
unchanged synthetic corpus before considering upgrades. This decision selects
an implementation candidate; it does not claim production compatibility,
performance, or complete ArchiMate viewpoint support.

## Evidence

The upstream elkjs README describes it as a graph layout library rather than a
diagramming framework and documents a Promise-based `layout` API and worker
support. The Eclipse Layered reference lists ports, edge labels, compound
graphs, and cross-hierarchy edges as supported graph features. It specifies
that cross-hierarchy layout requires enabling `elk.hierarchyHandling` at the
top level. The `MINIMUM_SIZE` node-size constraint preserves a configured
minimum size. These are upstream capability statements, not evidence that
this repository's adapter mapping is complete.

The reproducible spike installs the reviewed version ephemerally, without
changing `package.json` or `package-lock.json`:

```sh
npm install --no-save --no-package-lock --ignore-scripts elkjs@0.12.0
npx --yes --package=node@24 --call 'node test/spikes/elk-layered-layout.mts'
```

The script runs the same graph twice and asserts identical results, then runs
it once without the minimum-size constraint to reproduce the smaller
container. Its graph contains a compound node, a nested child, an external
node, an edge crossing the hierarchy boundary through fixed-side ports, and a
labeled edge. It asserts the route anchors meet the requested east and west
node boundaries. It also maps returned node rectangles and an edge section to
before/after snapshots for an invertible DTO-style patch.

Observed geometry with `elk.nodeSize.constraints=MINIMUM_SIZE` and minimum
`(260,150)`:

- compound `group`: `(12,12)`, `260×150`;
- nested `inside`: absolute `(32,36)`, `80×50`;
- external `outside`: `(431,33)`, `90×56`;
- cross-hierarchy route: `(116,61)` to `(427,61)`, with the requested port
  IDs as its endpoint shapes;
- edge label: `(297,64)`, `110×18`.

The same output was returned on both runs. The spike succeeds in translating
relative child positions to view coordinates and in preserving before/after
node and waypoint snapshots. The DTO itself still cannot carry the returned
label rectangle, as noted in the decision.

The unconstrained run omitted `MINIMUM_SIZE`; ELK shrank the declared `260×150`
compound to `124×94`. Adding the minimum-size constraint restored `260×150`.
Therefore the eventual adapter must pass minimum-size constraints explicitly
when authored container sizes are to be preserved.

## Limits

- One small graph establishes API-level feasibility only. It does not test
  large or deeply nested graphs, cycles, shared relationships, complex labels,
  all port configurations, worker lifecycle, browser bundle size, or
  performance.
- The fixture does not represent an ArchiMate specification rule. ELK is a
  layout engine and does not decide model semantics.
- The geometry snapshot check verifies the proposed DTO patch mapping shape;
  integration tests must use the real `LayoutPatch` API and prove applying
  and reversing the actual patch restores the original DTO exactly.
- Do not infer quality or runtime suitability from this one graph. #382 and
  #386 must provide those tests for their respective acceptance criteria.

## Public sources

- [elkjs upstream README and API](https://github.com/kieler/elkjs), retrieved
  2026-09-26.
- [ELK Layered supported graph features](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html),
  retrieved 2026-09-26.
- [ELK node-size constraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-nodeSize-constraints.html),
  retrieved 2026-09-26.
- [ELK port constraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-portConstraints.html)
  and [ELK port side](https://eclipse.dev/elk/reference/options/org-eclipse-elk-port-side.html),
  retrieved 2026-09-26.
- [ELK.js license and provenance review (#376)](elkjs-license-and-provenance.md),
  delivered in [PR #376](https://github.com/Tigon32/archimate-js/pull/376).

All test graph content is synthetic. No copied code or binary artifact is
added from ELK.
