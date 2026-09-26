# Diagram routing and reversible optimization

These are opt-in presentation tools. Neither changes ArchiMate model elements or
relationships, and imported MEFF geometry and authored routes remain untouched
unless a caller invokes one of the APIs. All coordinates passed to the headless
functions are diagram-space coordinates, including nested children.

```js
import {
  routeViewConnections,
  optimizeDiagram,
  applyLayoutPatch
} from 'archimate-js';

const routes = routeViewConnections({
  nodes: [
    { id: 'left', x: 0, y: 0, w: 100, h: 60 },
    { id: 'right', x: 300, y: 0, w: 100, h: 60 }
  ],
  connections: [{ id: 'link', source: 'left', target: 'right' }],
  clearance: 12
});

const result = optimizeDiagram(selectedView, { spacing: 40, padding: 24 });
const restored = applyLayoutPatch(result.view, result.patch, 'before');
const replayed = applyLayoutPatch(selectedView, result.patch, 'after');
```

`routeViewConnections` returns new connection objects with orthogonal `waypoints`
and metrics (`nodeIntersections`, `sharedSegmentCount`, `crossingCount`,
`unavoidableCrossings`). It routes around unrelated rectangular nodes, distributes
ports along a node's boundary, and avoids shared positive-length segments by
default. Set `bundle: true` to permit shared lanes. Input order does not affect
the routing order: connections are routed by id, then returned in input order.
Crossings are penalized during routing and reported if they remain. The method
is a deterministic heuristic rather than a proof of globally minimal crossings.
It throws if no route can avoid overlap or if the visibility grid exceeds its
resource bound; callers can keep their authored route in that case.

`optimizeDiagram` returns `{ view, patch, metrics }` without changing its input.
It lays out sibling nodes in stable relationship layers with configurable
spacing, recurses into groups, expands a group when children need more room,
and routes connections with the same router. The patch records `before` and
`after` node bounds and connection waypoints. `applyLayoutPatch` copies a view,
applies either side, and checks the view id. Semantic references, labels,
styles, extensions, and the original `meffGeometry` snapshot remain attached.
Metrics report moved nodes, rerouted connections, crossings, sibling overlaps,
and the view bounds before and after. Source MEFF geometry remains the source
snapshot; use the returned layout patch to map that source to optimized values.

The public `archimate-js/modeler` facade offers
`await modeler.optimizeDiagram({ strategy: 'builtin' })`. It runs the DTO
layout abstraction against the active view, applies only the returned geometry
patch as one `apply-layout-patch` DTO command, and returns `{ patch, metrics }`.
Routed points are normalized to integer MEFF attachment/bendpoint waypoints,
and a layout that cannot round-trip through MEFF is rejected before commit.
`modeler.undo()` and `modeler.redo()` reverse and restore the whole edit;
`modeler.applyLayoutPatch(patch, 'before' | 'after')` explicitly applies the
opposite side as another undoable edit (subject to stale-geometry checks).
`modeler.save()` exports the authoritative DTO and MEFF geometry. Unsupported
layout requests reject with content-free codes rather than falling back.

The direct legacy `lib/Modeler.ts` `optimizeDiagram(options)` remains unchanged
for consumers outside eligible DTO sessions. It applies the legacy optimizer
patch to the canvas via one `diagram.optimize` command; its diagram-js command
stack can undo and redo that canvas movement. `saveSVG()` reflects its rendered
canvas, but legacy moddle saving does not represent DTO facade edits. The
legacy class is not exported from the package root.

The fixture in `test/unit/diagram-layout.test.mjs` is **SYNTHETIC** and covers
obstacles, parallel routes, groups, nesting, labels, multiple relationship
types, patch replay, and undo/redo.

## Async DTO layout facade (issue #100, first slice)

```js
import { layoutView } from 'archimate-js/layout';

const result = await layoutView(modelDto, 'selected-view-id', {
  strategy: 'builtin', mode: 'full', spacing: 40
});
if (result.status === 'ok') {
  // The original DTO model stays untouched. Persist result.view explicitly.
  // result.patch holds before/after DTO bounds and waypoint arrays for undo.
  console.log(result.metrics.overlapCountBefore, result.metrics.overlapCountAfter);
} else {
  console.log(result.diagnostics);
}
```

The facade accepts the project-owned `ModelDto` boundary and returns a detached
`ViewDto`, a reversible geometry patch, and the built-in optimizer's actual
crossing, sibling-overlap, movement, reroute, and view-bound metrics. It does
not inspect or alter diagram-js runtime objects. Pass `strategy: 'builtin'`
explicitly; simply importing or rendering a view does not lay it out. If a
selected connection lacks an endpoint, or the DTO is invalid, it returns a
diagnostic without a view or patch. Unavailable `elk-layered` options return
explicit diagnostics, with no fallback to full built-in layout. Unknown
options are rejected so future controls are not silently ignored. This call
runs asynchronously at the API boundary, but the built-in optimizer itself
currently runs on the calling thread.

### Optional compound strategy (#382)

`strategy: 'elk-layered'` selects the exact `elkjs@0.12.0` adapter. It maps
nested containers and cross-hierarchy edges through fixed-side ports, keeps
authored container bounds as minimums, and returns orthogonal routes and
reversible DTO geometry. The adapter is loaded only when explicitly selected;
it never falls back to the built-in optimizer. Use `rankConstraints` to put
specific node IDs in the first or last layered rank:

```js
const result = await layoutView(modelDto, 'selected-view-id', {
  strategy: 'elk-layered',
  rankConstraints: [{ nodeId: 'start-node', rank: 'first' }]
});
```

This first adapter returns a stable `UNSUPPORTED_CONSTRAINT` diagnostic with
no partial result when a view has labeled edges, or when incremental layout or
pins are requested. The current renderer contract cannot faithfully project
ELK's edge-label rectangles; no label geometry is discarded or committed.
Other unsupported topology or unsatisfied rank requests also return explicit
diagnostics. The selected EPL-2.0 path and published integrity are recorded in
[`docs/research/elkjs-license-and-provenance.md`](../research/elkjs-license-and-provenance.md),
and the license text ships with `THIRD_PARTY_NOTICES.md`.

This is a partial implementation of #100. Advanced label placement, worker
execution, and benchmark/quality metrics beyond those measured by the layout
adapters remain open. The headless facade returns plain transport data; only the public
modeler facade commits the patch through DTO history. The legacy diagram-js
command stack remains solely for direct legacy modeler consumers.

## Layout quality comparison (#385)

[`layout-quality.md`](layout-quality.md) documents the SYNTHETIC comparison
corpus, raw quality metrics, deterministic SVG snapshot generation, and CI
artifact publication. The metrics compare presentation geometry only and are
not normative ArchiMate conformance evidence.

## Pins and incremental layout

The built-in strategy accepts hard and soft pins against the geometry in the
input view:

```js
const result = await layoutView(modelDto, 'selected-view-id', {
  strategy: 'builtin',
  pins: [
    { nodeId: 'authored-node', strength: 'hard' },
    { nodeId: 'preferred-node', strength: 'soft' }
  ]
});
```

A hard pin preserves the node's full input bounds. Pinning a container also
preserves its descendant subtree. Connections are routed again around the
resulting fixed geometry unless `routeConnections: false` is requested. A soft
pin leaves the built-in strategy free to move the node, reports its Euclidean
position displacement in `metrics.pinDisplacements` and
`metrics.softPinDisplacement`, and adds a deterministic warning when moved.

Incremental mode lists the changed nodes explicitly; all omitted nodes retain
their input bounds:

```js
const result = await layoutView(modelDto, 'selected-view-id', {
  strategy: 'builtin', mode: 'incremental',
  changedNodeIds: ['new-node', 'container-that-may-resize']
});
```

List every node whose geometry may change, including a container or descendant
that the optimizer may reposition. `metrics.unaffectedNodeDisplacement` reports
the total position movement of omitted nodes. Invalid or missing pin/change
targets return explicit diagnostics. All results remain detached and reversible
through the same geometry patch; source DTOs are not modified.
