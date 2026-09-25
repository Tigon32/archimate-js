---
title: "ADR-0010: Keep diagram-js behind an engine-neutral editor boundary"
status: "Proposed"
date: "2026-09-25"
authors: "Tigon32 repository maintainers"
tags: ["architecture", "editor", "diagram-engine"]
supersedes: ""
superseded_by: ""
---

# ADR-0010: Keep diagram-js behind an engine-neutral editor boundary

## Status

**Proposed** — this record sets the editor-engine boundary for the current
editor workstream. It does not schedule an engine migration.

## Context

The current editor is built on
[diagram-js](https://github.com/bpmn-io/diagram-js), while the repository is
moving persistent editing authority toward typed ArchiMate model and view DTOs.
The detailed milestone plan is tracked in the
[Miro-like editor workstream](../roadmap/miro-like-editor-workstream.md), with
contract tests, import-boundary cleanup, public modeler entry points, editor
intents, layout patch routing, domain relationship rules, and legacy moddle
convergence across EE-M1 through EE-M13.

[ADR-0004](0004-typescript-and-module-size.md) keeps TypeScript migration and
public entry points incremental. [ADR-0008](0008-third-party-extension-boundary.md)
prevents raw diagram-js or moddle objects from becoming public contracts.
[docs/roadmap/editor-and-design-system.md](../roadmap/editor-and-design-system.md)
sets an engine-switch gate instead of switching engines for branding reasons.
[docs/editor/diagram-adapter.md](../editor/diagram-adapter.md) documents the
current DTO editor command boundary.

## Decision

The dependency direction is:

```text
Domain/View model -> DiagramJsAdapter -> diagram-js
```

The reverse direction is not permitted: renderer objects and services must not
become the canonical source for ArchiMate semantics or persistent view state.

- **DEC-001 — Current engine:** diagram-js remains the editor engine for the
  current implementation.
- **DEC-002 — Workstream focus:** The project improves the interaction layer
  rather than replacing the engine during this workstream.
- **DEC-003 — Implementation detail:** diagram-js is an implementation detail
  behind an editor/diagram-engine boundary, not the canonical representation of
  the ArchiMate domain.
- **DEC-004 — State separation:** Semantic ArchiMate state and
  view/presentation state remain independent of renderer-specific objects.
- **DEC-005 — Future portability:** The architecture preserves the option to
  replace diagram-js with React Flow or another engine later.
- **DEC-006 — Migration meaning:** React Flow adoption would constitute an
  editor-engine migration, not a UI refactor.
- **DEC-007 — Capabilities over least-common-denominator:** Engine portability
  must not prevent using valuable diagram-js-specific capabilities today.
  Optional engine-specific capability interfaces such as
  `DiagramLayoutCapabilities`, `DiagramRoutingCapabilities`, or
  `DiagramJsCapabilities` are acceptable.
- **DEC-008 — One authoritative editing state:** Avoid introducing a second
  canonical diagram state model solely to support abstraction. `ModelDto`
  (`src/model-dto`) owned by `DiagramAdapter` is the authoritative domain/view
  state in editing sessions; diagram-js elements are transient projections;
  legacy moddle state is a compatibility path to be converged in EE-M13.

## Consequences

### Positive

- **POS-001:** The current editor can keep using proven diagram-js canvas,
  command, selection, and renderer integration while DTO authority improves.
- **POS-002:** Engine-specific objects stay isolated from public contracts and
  ArchiMate domain services.
- **POS-003:** A future engine spike has a concrete seam and can be evaluated
  against the same editor contract tests planned in EE-M2.
- **POS-004:** Valuable engine-specific layout, routing, and interaction
  features can still ship behind explicit capability interfaces.

### Negative

- **NEG-001:** The project must maintain adapter discipline while diagram-js is
  still deeply embedded in current editor modules.
- **NEG-002:** Some interaction behavior remains engine-specific by nature:
  selection visuals, handles, bendpoints, hover, snapping, drag, viewport, and
  keyboard integration cannot be made fully portable without reimplementation.
- **NEG-003:** Legacy moddle save compatibility remains a convergence task
  until EE-M13 removes it from the authoritative editing path.

## Alternatives considered

### Replace diagram-js with React Flow now

- **ALT-001:** Move the editor directly to React Flow during this workstream.
- **ALT-002:** Rejected because this repository does not currently require a
  React shell, and the migration would rebuild canvas lifecycle, selection,
  commands, bendpoints, accessibility behavior, and existing editor features
  before the DTO command boundary is complete.

### Make diagram-js the architecture

- **ALT-003:** Treat diagram-js elements, services, and moddle business objects
  as the persistent editor architecture.
- **ALT-004:** Rejected because it creates engine lock-in and dual state
  between renderer objects and ArchiMate domain/view data.

### Generic lowest-common-denominator engine abstraction

- **ALT-005:** Define only capabilities common to diagram-js, React Flow, and
  other diagram engines.
- **ALT-006:** Rejected as premature abstraction. It would hide useful
  diagram-js capabilities and weaken the current editor to fit a hypothetical
  replacement.

### Separate app-level view model duplicating DTO

- **ALT-007:** Add another canonical application view model between `ModelDto`
  and the canvas adapter.
- **ALT-008:** Rejected because it creates three states: DTO, app view model,
  and engine projection. The DTO-owned editing session remains authoritative.

## Implementation notes

- **IMP-001:** EE-M1 should enforce import boundaries so new domain, shell, and
  public API code do not depend on diagram-js directly.
- **IMP-002:** EE-M2 should define contract tests that any `CanvasPort`
  implementation must pass before it can be considered a candidate engine.
- **IMP-003:** EE-M3 should move `DiagramJsCanvasPort` out of the
  engine-neutral `archimate-js/model-dto` entry.
- **IMP-004:** EE-M5 and EE-M6 should express persistent interactions as editor
  intents and layout patches, not as diagram-js command-stack side effects.
- **IMP-005:** EE-M7 should make domain relationship validation authoritative
  while diagram-js `RuleProvider` remains only the live gesture adapter.
- **IMP-006:** EE-M13 should converge the legacy moddle save path with DTO
  authority so `BaseViewer.saveXML()` is no longer the editing source of truth.

## References

- **REF-001:** [diagram-js](https://github.com/bpmn-io/diagram-js), a generic
  MIT-licensed browser diagram toolkit; retrieved 2026-09-25.
- **REF-002:** [ADR-0004: TypeScript-first incremental migration and module
  size](0004-typescript-and-module-size.md).
- **REF-003:** [ADR-0008: Establish a bounded third-party extension API
  boundary](0008-third-party-extension-boundary.md).
- **REF-004:** [Editor and design system roadmap](../roadmap/editor-and-design-system.md).
- **REF-005:** [DTO editor command boundary](../editor/diagram-adapter.md).
- **REF-006:** [React Flow migration path](../editor/react-flow-migration-path.md).
