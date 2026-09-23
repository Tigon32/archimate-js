# ADR-0003: Deterministic report rendering

Date: 2026-09-23
Status: Proposed

## Context

The project should support diagrams in generated HTML reports and rendered images referenced from Markdown. If these paths use separate sources, diagrams will drift and become expensive to maintain.

The same architecture model and view definition should drive:

- interactive browser embedding;
- deterministic SVG export;
- rendered image generation for Markdown;
- CI validation and snapshot tests.

## Decision

Use one model/view source and generate all report renderings from it. SVG is the canonical report rendering target. PNG or other raster outputs are derived artifacts.

The target pipeline is:

```text
model + view id -> canonical view model -> deterministic SVG -> HTML embed and Markdown image asset
```

## Consequences

- Rendering changes require snapshot or structural SVG tests.
- SVG output should avoid non-deterministic IDs, timestamps, ordering, or layout side effects.
- Accessibility metadata should be included where feasible.
- Markdown images and HTML diagrams must be traceable to the same source view.
- Render-only libraries such as `archimate-renderer` may inform design and tests, but this fork remains responsible for its own provenance and conformance.

## References

- archimate-js upstream: https://github.com/archimodel/archimate-js
- archimate-renderer reference: https://github.com/ThomasRohde/archimate-renderer
- diagram-js: https://github.com/bpmn-io/diagram-js
