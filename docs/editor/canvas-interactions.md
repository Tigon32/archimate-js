# Canvas interactions and shortcuts

The editor reuses diagram-js 15.26.0 interaction modules where practical:
`zoomscroll`, `movecanvas`, `hand-tool`, `lasso-tool`, `keyboard`,
`keyboard-move-selection`, and selection behavior. These services stay behind
the diagram-js adapter and are not exposed through `archimate-js/modeler`.

| Interaction | Shortcut or gesture |
| --- | --- |
| Pan viewport | Wheel/trackpad scroll, or Space+drag while the canvas has focus. |
| Zoom viewport | Ctrl+wheel; browser trackpad pinch is reported as Ctrl+wheel. |
| Marquee selection | Shift-drag on the canvas. Plain empty-canvas drag continues to pan through diagram-js `movecanvas`, so lasso uses the built-in modifier gesture. |
| Toggle multi-select | Shift-click an element. |
| Move selection | Arrow keys, with Shift acceleration from diagram-js keyboard move selection. |
| Delete selection | Delete or Backspace. Multi-select persistent delete is completed by EE-M5 (#347). |
| Clear selection | Escape. |
| Select all | Cmd/Ctrl+A. |
| Fit view | Cmd/Ctrl+0 or Shift+1. |
| Fit selection | Shift+2. |

Shortcuts are canvas-scoped. They do not fire while direct label editing or
another text input owns focus.
