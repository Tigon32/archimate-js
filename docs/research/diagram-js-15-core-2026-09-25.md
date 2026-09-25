# diagram-js 15 core migration notes (2026-09-25)

This change upgrades the viewer to `diagram-js@15.26.0`. It removes the former
`diagram-js/lib/navigation/touch` registration from the viewer. Upstream does
not ship that module in 15.26.0 and provides no Hammer.js-based replacement;
this project does not add another gesture dependency. The viewer keeps its
mouse/trackpad canvas pan (`navigation/movecanvas`) and zoom (`navigation/zoomscroll`).
Touch-specific gestures remain unsupported by this migration.

The 15.x selection feature no longer owns the selection outline feature. The
viewer registers `diagram-js/lib/features/outline` alongside selection so
selected shapes and connections continue to receive visible outlines. The
upstream 15.x multi-selection interaction is Shift-click; this migration leaves
selection event semantics to the upstream selection module.

Public upstream references:

- [diagram-js 15.26.0 navigation modules](https://github.com/bpmn-io/diagram-js/tree/v15.26.0/lib/navigation)
- [diagram-js 15.26.0 outline feature](https://github.com/bpmn-io/diagram-js/tree/v15.26.0/lib/features/outline)
- [diagram-js changelog](https://github.com/bpmn-io/diagram-js/blob/v15.26.0/CHANGELOG.md)
- [diagram-js selection contract](https://github.com/bpmn-io/diagram-js/tree/v15.26.0/lib/features/selection)

The research scope and compatibility inventory are recorded in public issue
[#245](https://github.com/Tigon32/archimate-js/issues/245). This note records
only the implementation boundary; interaction/focus regression coverage is
tracked separately in [#252](https://github.com/Tigon32/archimate-js/issues/252).
