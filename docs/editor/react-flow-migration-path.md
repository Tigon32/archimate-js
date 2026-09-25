# Replacing diagram-js with React Flow: migration path (not scheduled)

Status: informational
Date: 2026-09-25

This note describes what a future React Flow migration would keep, replace, and
reimplement. It is not a plan to migrate. The scheduled editor work remains the
[Miro-like editor workstream](../roadmap/miro-like-editor-workstream.md) and
the engine decision is recorded in
[ADR-0010](../adr/0010-diagram-engine-boundary.md).

## Today and possible future

Today:

```text
ArchiMate domain/view DTOs
        -> Editor API and commands
        -> DiagramJsAdapter / DiagramJsCanvasPort
        -> diagram-js canvas, services, renderer, and command stack
```

Possible future:

```text
ArchiMate domain/view DTOs
        -> Editor API and commands
        -> ReactFlowAdapter / ReactFlowCanvasPort
        -> React Flow nodes, edges, viewport, and interaction layer
```

React Flow would replace the editor engine adapter. It would not replace the
ArchiMate language model, exchange model, validation, linting, repository
structure, report renderer, or application-level editor semantics.

## Layers that should remain unchanged

| Layer | Expected migration impact |
| --- | --- |
| ArchiMate semantic model | Keep `ModelDto` as the authoritative editing state. |
| Relationship validation | Keep domain validation in `src/language` and `src/validator`. |
| MEFF import/export | Keep `src/model-dto` MEFF converters such as `meff-*`. |
| Repository structure and DTOs | Keep model DTO ownership and public package boundaries. |
| Linting | Keep `src/lint` rules independent of renderer objects. |
| View semantics | Keep nodes, connections, nesting, labels, styles, and waypoints in DTOs. |
| Layout patch format | Keep `src/layout` `LayoutPatch` as the persistent layout delta. |
| Application shell | Keep properties, search, shell logic, outline, and diff APIs engine-neutral. |

## Adapter that would be replaced

A migration would replace the current adapter and engine composition:

- `DiagramJsCanvasPort` in `src/model-dto/diagram-js-canvas-port.ts`.
- `Modeler` composition in `lib/Modeler.ts` and `lib/features/*`.
- `ArchimateRenderer` in `lib/draw`.

The replacement would be a `ReactFlowCanvasPort` implementing the same
`CanvasPort` contract plus React node and edge renderers consuming the same
notation tokens and concept-renderer projections. React Flow documents custom
nodes as React components and custom edges as React components with edge
controls; sub flows use parent-child node relationships.

## Interactions that would need reimplementation

Full renderer independence is unrealistic for interaction details. A migration
must isolate these behaviors rather than pretend they are portable:

- selection visuals and multi-select feedback;
- connection handles, validation affordances, and reconnect behavior;
- bendpoint interaction; React Flow documents custom/editable edge examples,
  so ArchiMate bendpoint editing should be treated as custom implementation,
  not assumed built-in capability;
- hover states, snapping, drag, and drop target feedback;
- node rendering and edge rendering, including ArchiMate markers, line
  patterns, relationship labels, and explicit style overrides;
- viewport pan/zoom/fit behavior and keyboard integration;
- context pads, toolbars, direct label editing, copy/paste, and undo grouping;
- nested and compound nodes using React Flow sub flows or `parentId`;
- orthogonal routing and route preservation;
- SVG export determinism.

React Flow nodes are rendered as HTML elements while edges are SVG. The
deterministic SVG report export covered by
[ADR-0003](../adr/0003-deterministic-report-rendering.md) would therefore keep
using the existing diagram-js/SVG renderer or a separate deterministic renderer
unless a future React Flow spike proves equivalent output.

## Current diagram-js leakage beyond the intended boundary

These verified references show why the boundary must improve before any engine
replacement is economical:

- `src/model-dto/index.ts` exports `DiagramJsCanvasPort` and
  `DtoModelerSession` from the engine-neutral `archimate-js/model-dto` entry.
- `lib/Modeler.ts` `optimizeDiagram` reads the root `businessObject`, uses
  `elementRegistry`, and executes `commandStack.execute('diagram.optimize')`.
- `lib/features/rules/ArchimateRules.js` extends diagram-js `RuleProvider` and
  remains the live gesture authority for relationships, backed by legacy
  generated `RelationshipUtil`, instead of delegating to the domain decision
  service.
- `BaseViewer.saveXML()` still serializes moddle `businessObject` state mutated
  by diagram-js command handlers in `lib/features/modeling/cmd/*`; a repository
  grep shows about 31 `lib` files currently reference `businessObject`.
- `BaseViewer` extends diagram-js `Diagram`, so the public Viewer API inherits
  diagram-js service lookup through `get(service)`.
- `lib/draw/ArchimateRenderer.js` extends diagram-js `BaseRenderer` and reads
  `businessObject`.
- `mountViewer` in `lib/public-api.js` uses `viewer._moddle`.

## Debt to reduce before a migration

Architectural rules that keep this debt from growing:

- no new diagram-js imports outside the adapter and legacy `lib` engine layer;
- no shell or domain code that calls `get('elementRegistry')` or other
  diagram-js services;
- express every persistent edit as an `EditorCommand`, with layout through
  `LayoutPatch`;
- put engine-specific layout, routing, and gesture features behind capability
  interfaces;
- route notation styling through tokens and concept-renderer projection data,
  not hard-coded renderer branches;
- require a contract test suite that any `CanvasPort` implementation must pass.

The related milestones are EE-M1 import-boundary checks, EE-M2 engine contract
tests, EE-M3 adapter export cleanup, EE-M4 public `archimate-js/modeler` entry,
EE-M5 editor intents, EE-M6 DTO layout patches, EE-M7 domain-authoritative
relationship rules, and EE-M13 legacy moddle convergence.

## Criteria that could justify migration

Start a migration only after the
[engine-switch gate](../roadmap/editor-and-design-system.md#engine-switch-gate)
is met and the trigger is concrete and measurable:

- a documented user requirement cannot be met economically on diagram-js after
  a time-boxed spike;
- product direction commits to a React application shell and rich HTML
  node-UI-in-canvas requirements;
- diagram-js maintenance or security status deteriorates enough to create an
  accepted project risk;
- performance budget failures, including #107, are traced to the engine after
  adapter and DTO bottlenecks are ruled out;
- the engine contract suite and adapter boundary are green, so replacement is
  measurable rather than speculative.

## Hypothetical phases, not schedule

1. Spike the same public synthetic ArchiMate view in diagram-js and React Flow,
   including nesting, connection validation, reconnect, bendpoints, keyboard
   flows, and SVG/report export expectations.
2. Build `ReactFlowCanvasPort` until it passes the engine contract suite
   without changing `ModelDto` or MEFF contracts.
3. Reimplement parity interactions: selection, handles, labels, copy/paste,
   routing, snapping, viewport, context pads, and accessibility.
4. Run a dual-engine period behind an explicit flag using synthetic/public
   fixtures only.
5. Switch only after import/edit/export/re-import, accessible outline, diff,
   linting, and deterministic report rendering acceptance checks are green.

## Public sources

- [React Flow documentation](https://reactflow.dev/) for custom nodes, custom
  edges, handles, sub flows, accessibility, and examples.
- [React Flow documentation index](https://reactflow.dev/llms.txt), which lists
  custom nodes, custom edges, sub flows, edge routing, editable edge examples,
  accessibility, and testing pages; retrieved 2026-09-25.
- [xyflow repository](https://github.com/xyflow/xyflow), which identifies
  `@xyflow/react` as the React Flow package and states MIT licensing; retrieved
  2026-09-25.
- [diagram-js GitHub repository](https://github.com/bpmn-io/diagram-js), a
  generic MIT-licensed browser diagram toolkit; retrieved 2026-09-25.
