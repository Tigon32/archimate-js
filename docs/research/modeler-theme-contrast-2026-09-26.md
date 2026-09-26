# Modeler theme contrast browser check

Date: 2026-09-26

Provenance: `SYNTHETIC` browser fixture built from `test/fixtures/synthetic/dto-export-view.xml`, plus synthetic app chrome controls created inside `test/browser/modeler-theme-contrast.mts`. No customer, private, or real architecture model data was used.

Runtime: macOS, Google Chrome 154.0.8037.58, package 0.0.4.

Method: `test/browser/modeler-theme-contrast.mts` compiles the public modeler facade into a temporary Chromium bundle, loads the synthetic DTO MEFF view, applies the app CSS, and measures computed rendered sRGB contrast for the modeler toolbar buttons, diagram-js palette entries, selected node outline, selected connection bendpoint/segment handles, multi-selection bounding box, lasso rectangle, hover affordance, status surface, and error overlay. The test checks the default choice under both light and dark OS preferences, plus explicit light, dark, high-contrast-light, and high-contrast-dark choices. It compares unrounded ratios against 4.5:1 normal text, 3:1 large text, 3:1 non-text in default/light/dark modes, and 7:1 normal text, 4.5:1 large text, 3:1 non-text in high-contrast modes. It also checks focus visibility, unclipped focus bounds, and the WCAG 2.4.13 two-pixel focus-area benchmark for toolbar and palette controls, then checks forced-colors boundaries/focus and verifies app chrome does not compute to `forced-color-adjust: none`.

| Choice / OS preference | Lowest measured normal text | Lowest measured large text | Lowest measured non-text | Toolbar focus | Palette focus |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default / light | 4.75:1 | 15.57:1 | 4.55:1 | 6.05:1 | 5.74:1 |
| Default / dark | 5.03:1 | 12.56:1 | 4.38:1 | 7.76:1 | 6.51:1 |
| Light | 4.75:1 | 15.57:1 | 4.55:1 | 6.05:1 | 5.74:1 |
| Dark | 5.03:1 | 12.56:1 | 4.38:1 | 7.76:1 | 6.51:1 |
| High contrast light | 8.78:1 | 19.03:1 | 9.19:1 | 10.28:1 | 9.85:1 |
| High contrast dark | 8.12:1 | 18.26:1 | 9.62:1 | 12.54:1 | 11.24:1 |

The displayed values are rounded for readability; the executable check compares full-precision ratios. Palette hover now measures the actually hovered entry's text against that entry's effective rendered background, walking to the first opaque ancestor only when the entry background is transparent. Representative interaction ratios after the fix: selected node outlines measured 6.05:1 or higher, selected connection bendpoint/segment handles measured 7.79:1 or higher, multi-selection bounding boxes measured 7.79:1 or higher, lasso stroke measured 7.79:1 or higher, canvas hover affordance measured 7.79:1 or higher, status/error boundaries measured 4.80:1 or higher, and overlay text measured 12.56:1 or higher. The selected connection's own rendered stroke is asserted present with a non-zero box but remains notation/model rendering, not an app-owned theme color.

Findings and fixes:

- The modeler bundle initially failed to load in Chromium because `lib/draw/ArchimateRenderer.js` contained `logger.log({ parentGfx, shape })` with a non-ASCII separator that parsed as invalid JavaScript. The line also logged rendered shape payloads. Removing that line restored browser loading without changing notation or export behavior.
- The app shell did not theme diagram-js interaction variables, so selection, bendpoint handles, lasso, and hover affordances were inherited from diagram-js defaults instead of `--am-ui-*` tokens. `assets/design-tokens/app-shell.css` now maps the diagram-js canvas/interaction variables to app tokens.
- The modeler hover marker existed only as an invisible diagram-js hit overlay on `main`, so the canvas hover affordance was first missing, then measured at 1.00:1 before overriding the hit overlay stroke/opacity. The fixed hover affordance measures 7.79:1 in light/default-light, 9.95:1 in dark/default-dark, 10.28:1 in high-contrast-light, and 12.54:1 in high-contrast-dark.
- Forced-colors mode keeps toolbar, palette focus, selected node outlines, selected connection handles, multi-selection bounding boxes, canvas hover outline, lasso, status/error boundaries, overlay boundaries, and focus boundaries visible, and the checked app chrome/interaction surfaces do not compute `forced-color-adjust: none`.

Limitations: this is an automated Chromium rendering gate for app-owned modeler chrome and the EE-M8 interaction layer on a synthetic fixture. It does not claim full WCAG conformance, does not assess assistive-technology journeys, does not change or evaluate model-authored ArchiMate notation colors, and does not inspect future panels that are out of scope for #389. SVG export invariance remains covered by `test/browser/theme-export-invariance.mts`.
