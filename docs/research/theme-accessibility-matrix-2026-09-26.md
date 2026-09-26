# Theme accessibility results matrix

Date: 2026-09-26

Provenance: `PUBLIC` repository source and `SYNTHETIC` fixtures only. No
private architecture data, model exports, screenshots, hostnames, or customer
details were used.

Browser/platform: automated Chromium checks on macOS in this worktree, using
`CHROME_BIN=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` when
available. CI runs the same browser tests with its configured Chromium binary.

## Components, states, and evidence

| Area | Components and states checked | Evidence and result | Limits |
| --- | --- | --- | --- |
| Theme choices | Default, Light, Dark, High contrast light, High contrast dark | `test/browser/theme-contrast.mts`, `test/browser/theme-export-invariance.mts`, and `test/browser/theme-zoom.mts` exercise all five choices. Default resolves to the OS light/dark preference for app UI only. | Default was automated with light and dark preference in contrast checks; the new zoom check fixes Default to light preference so geometry is deterministic. |
| App shell controls | Heading, body text, label, native theme select, toolbar button/link, status, focus-visible, hover, invalid, disabled token roles, panel surface | Existing contrast and reflow checks stay green; the new 400% zoom-equivalent test checks visible text/control boxes, page width, and no overlap for shell and toolbar groups. | Native select popup internals and assistive-technology announcements are not inspected by DOM geometry tests. |
| Interactive modeler canvas | Modeler SVG inside an `.am-ui-panel`; wheel zoom, wheel pan, and fit view | `test/browser/theme-zoom.mts` loads the public synthetic DTO view in the browser modeler for each theme and verifies pan/zoom still changes the diagram viewport at 400% zoom-equivalent metrics. | It verifies the present modeler canvas, not future editor panels, dialogs, or inspector workflows. |
| Contrast | Rendered text, controls, status, hover, invalid boundaries, focus outline | `docs/research/theme-contrast-browser-2026-09-24.md` reports minimum text/boundary/focus ratios. Lowest ordinary text is 7.79:1; lowest high-contrast text is 10.28:1; lowest boundary is 4.38:1; lowest focus is 6.05:1. Modeler chrome and canvas interaction states (#389, `test/browser/modeler-theme-contrast.mts`; [`modeler-theme-contrast-2026-09-26.md`](modeler-theme-contrast-2026-09-26.md)): lowest normal text 4.75:1 (default/light) and 5.03:1 (dark), 8.78:1 / 8.12:1 in high-contrast light / dark; lowest non-text 4.38:1, or 9.19:1+ in high contrast; selected node outline 6.05:1+, selected connection handles, lasso, and canvas hover 7.79:1+. The fix raised canvas hover from 1.00:1. | Ratios are computed sRGB values for listed states, not a full-page WCAG conformance claim. |
| Forced colors | App shell, field, button, borders, focus outline, system color mapping | `test/browser/theme-contrast.mts` emulates `forced-colors: active` and verifies CanvasText, ButtonText, Highlight, visible borders, focus, and no `forced-color-adjust: none` suppression on checked controls. | Platform-specific manual high-contrast palettes remain useful supplementary evidence. |
| Reduced motion | App shell animation/transition suppression | `assets/design-tokens/app-shell.css` includes `@media (prefers-reduced-motion: reduce)` to reduce app-shell animations and transitions. `test/browser/theme-chooser.mts` (#390, merged in #394) asserts that computed transition and animation durations are effectively zero under `prefers-reduced-motion: reduce`. | Keyboard-only and pointer theme selection, persistence across reload and a real `openView()` view change, blocked storage, and OS-preference precedence are verified by the same test; the contract is documented in `docs/roadmap/app-shell-styles.md`. |
| Zoom, resize, reflow, text spacing | 200% text resize, 320 CSS-pixel reflow, WCAG text-spacing overrides, 400% zoom-equivalent app shell and modeler | `docs/research/read-only-reflow-browser-2026-09-24.md` records the existing 200% text resize, 320px reflow, and text-spacing results from `test/browser/theme-contrast.mts`. `test/browser/theme-zoom.mts` adds a Chromium 400% zoom-equivalent check using CDP `Emulation.setDeviceMetricsOverride` with `width=320`, `height=900`, `deviceScaleFactor=4`, `mobile=false`. | CDP device metrics emulate a 320 CSS-pixel viewport at DPR 4. This is repeatable automation evidence for 400% zoom behavior, not a substitute for manual browser UI zoom review. |
| Export invariance | Rendered diagram markup and exported SVG across five app themes | `test/browser/theme-export-invariance.mts` verifies changing app UI theme does not rewrite rendered diagram styling and produces byte-identical SVG export output across all five choices. | It covers the synthetic DTO export fixture and app-theme independence, not every possible model-authored style. |
| Token roles and migration | `--am-ui-*` roles, `.am-app`, `data-theme`, legacy stylesheet import path | `docs/roadmap/app-shell-styles.md` documents token roles, the `data-theme="dark"` migration path, legacy `.am-app` wrapping, and the boundary between app UI tokens and notation/export styles. | Integrators with custom CSS still need to map their host controls to the documented roles. |

## Remaining limitations and future scope

The current automated matrix is partial evidence for #136, not a WCAG
conformance statement. Remaining manual or future checks include native select
popup rendering, screen-reader journeys, platform-specific forced-colors review,
and user-agent browser zoom using the browser UI. Full panel/editor controls
move to the future panel issues: #351, #356, #361, #363, and #364. Those issues
should add rendered-state checks for their own controls rather than expanding
this shell/canvas matrix beyond the current public app surfaces.
