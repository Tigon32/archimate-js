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

The internal `Modeler.prototype.optimizeDiagram(options)` applies the same patch
to the active canvas as one `diagram.optimize` command. The diagram-js command
stack can undo and redo its node movement and waypoint changes atomically.
After importing a view, normal `saveSVG()` serializes the rendered canvas with
its current waypoints. The modeler class is not exported from the package root;
the headless APIs above are the supported public entry points.

The fixture in `test/unit/diagram-layout.test.mjs` is **SYNTHETIC** and covers
obstacles, parallel routes, groups, nesting, labels, multiple relationship
types, patch replay, and undo/redo.
