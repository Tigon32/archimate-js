# GitHub Project plan

Date: 2026-09-24
Status: Roadmap for issue-tracked delivery

## Current repository state

The live issue search returned no open issues. Issues #59, #60, #64, #74–#77,
and #83 are closed as completed. Keep those as completed history; do not create
duplicate issues or reopen them as roadmap work. Track new work as GitHub
issues and add those issue cards to the repository Project.

## Project fields

| Field | Values / use |
| --- | --- |
| Status | Backlog, Ready, In progress, Blocked, Done |
| Priority | P0 foundation, P1 core, P2 workflow, P3 later |
| Workstream | TypeScript, Domain model, Design system, Editor, Viewpoints, Layout, Quality |
| Depends on | Link blocking project cards; record soft sequencing separately in the description |

Use the existing closed issues as historical context. Add only the net-new
implementation tasks below. Keep feature work small enough to ship behind the
existing standalone browser bundle.

## Proposed roadmap cards

### P0 — Add TypeScript migration and module-size CI gates

**Goal:** Make gradual migration enforceable without a bulk rewrite.

**Scope:** Apply ADR-0004: new first-party code is TypeScript; when an existing
JavaScript file is changed, migrate that file in the same change where
practical. Type-check application and test code in CI. Enforce the agreed
non-comment LOC and function-size limits, with a documented exception path.

**Exit criteria:** CI rejects new first-party JavaScript outside documented
exceptions, type errors, oversized modules/functions, and undocumented
exceptions. Existing unrelated JavaScript remains eligible for gradual
migration.

### P1 — Define typed ArchiMate model and view DTOs

**Goal:** Keep persistent model and diagram data independent of editor internals.

**Scope:** Define typed model, view, geometry, style-override, and diagnostic
contracts. Treat XML/moddle and public JavaScript inputs as `unknown` until
validated. Add contract tests for parsing, serialization, and persistence.

**Exit criteria:** Import/export and editor operations use the shared contracts;
tests prove DTO round trips; no serialized state depends on diagram-js object
instances.

### P1 — Integrate the supplied ArchiMate 4 styling extract

**Goal:** Adopt the supplied notation tokens and SVG symbols directly, then
connect them to the current renderer without changing the UI framework.

**Scope:** Preserve the provided `tokens.json`, `archimate.css`, and
`archimate-symbols.svg` as unmodified source assets under
`assets/archimate-4-kit/`. Integrate them with the renderer behind a small
application-owned adapter. Keep application-control styles separate from
ArchiMate notation tokens and preserve model-authored style overrides. Do not
copy `spec/` or `catalog/` content. Audit remote fonts for offline distribution.

**Exit criteria:** Rendered elements and relationships use the supplied token
and symbol definitions; model-authored styles continue to override defaults;
standalone output includes the required CSS and SVG symbols; app-control styles
remain scoped and independent.

### P1 — Define the diagram adapter and command boundary

**Depends on:** Typed model and view DTOs.

**Goal:** Isolate diagram-js behind an app-owned editor interface.

**Scope:** Define typed projection, selection, geometry, event, and command
interfaces. Ensure persistent edits run through undoable commands. Keep
diagram-js as the implementation for this roadmap.

**Exit criteria:** Save/export reads app-owned DTOs; move/resize/connect/delete
commands update model/view state without leaking diagram-js objects through the
public API.

### P2 — Complete core editor workflows and viewpoint feedback

**Depends on:** Typed DTOs and diagram adapter.

**Goal:** Make the modeler usable for authoring and review, not only rendering.

**Scope:** Select, navigate, create, move, resize, delete, connect/reconnect,
edit labels and properties, and undo/redo. Add palette/search, model tree,
properties inspector, multi-view workflow, keyboard support, and viewpoint
feedback. Viewpoint checking warns by default; stricter enforcement is opt-in.

**Exit criteria:** Persistent edits round-trip; relationship rules are enforced;
viewpoint messages identify out-of-viewpoint concepts without blocking default
editing; extracted spec/catalog/viewpoint data remains private.

### P2 — Verify reversible layout and routing delivery

**Context:** Issues #60 and #83 are closed as completed.

**Goal:** Confirm the delivered router/optimizer meets its issue acceptance
criteria on synthetic and public-source diagrams before planning further layout
work.

**Exit criteria:** Deterministic routing/layout; authored geometry remains
unchanged unless explicitly optimized; undo restores exact geometry; SVG output
preserves the result. Create a follow-up card only for a verified unmet
criterion. Review a layout dependency's license before distribution.

### P2 — Add editor interaction and accessibility quality gates

**Depends on:** UI tokens, core editor workflows, and viewpoint feedback.

**Goal:** Prevent regressions in pointer, keyboard, accessibility, and saved
diagram behavior.

**Scope:** Browser-level workflows, accessible names/focus, deterministic SVG,
persisted geometry, import/edit/export/re-import, and offline standalone output.

**Exit criteria:** CI exercises representative pointer and keyboard flows and
verifies persisted model/view semantics and exported SVG.

## Sequencing

1. Land the TypeScript and size gates under ADR-0004.
2. Define the typed DTO contracts; migrate files as they are touched.
3. Integrate the supplied notation tokens and symbols in parallel with DTO work;
   add product-control tokens separately as those controls are built.
4. Add the diagram adapter and command boundary.
5. Complete editor workflows and integrate viewpoint feedback.
6. Verify #60/#83 outcomes, then add only evidence-based follow-ups.
7. Make interaction, accessibility, and standalone distribution checks a CI
   gate.

This sequence sits after already-completed repository issues #59, #64,
#74–#77, #60, and #83. It does not replace the public-source-only rule or the
requirement to keep The Open Group's `spec/` and `catalog/` content private.
