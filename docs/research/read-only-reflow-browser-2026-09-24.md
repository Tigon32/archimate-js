# Read-only shell resize and reflow check

Date: 2026-09-24

Provenance: `SYNTHETIC` public read-only example in this repository. No private architecture data.

Runtime: macOS 26.6.2, Chrome 154.0.8037.58, package 0.0.4. The required CI browser check also runs Chromium on Ubuntu.

The browser test in `test/browser/theme-contrast.mts` loads the example HTML, theme script, and actual app CSS. It runs the five selector choices: Default, Light, Dark, High contrast light, and High contrast dark. For each choice it checks these conditions:

| Condition | Test setup | Observed result |
| --- | --- | --- |
| 200% text resize | 1280 CSS-pixel viewport; root font size doubled | Computed font size doubles for heading, paragraph, label, chooser, button, and status. Their boxes remain inside the viewport; text ranges for non-native controls remain inside their boxes; no page-level horizontal overflow. |
| Narrow reflow | 320 CSS-pixel viewport, equivalent to the CSS viewport width of a 1280-pixel desktop at 400% zoom | Listed shell content stays in the viewport without page-level horizontal scrolling. The spatial diagram remains scrollable inside its frame. |
| Text spacing | Same 320 CSS-pixel viewport; line height 1.5, letter spacing 0.12em, word spacing 0.16em, paragraph spacing 2em | Listed shell content remains in the viewport without page-level horizontal scrolling. |

All five modes passed all three conditions in the local Chromium run. The test checks element and text-range rectangles, document scroll width, the selected theme's accessible name, and that spacing overrides took effect. Native select option rendering cannot be inspected with DOM text ranges; manual visual review and actual browser zoom controls remain necessary. The diagram fixture and full viewer are deliberately not rendered by this shell check, so the spatial diagram's inner scrolling is structural evidence only. Full editor, notation, forced-colors, and assistive-technology checks remain under #136. This result is not a WCAG conformance claim.

The tested thresholds come from the normative W3C [WCAG 2.2 Resize Text](https://www.w3.org/TR/WCAG22/#resize-text), [Reflow](https://www.w3.org/TR/WCAG22/#reflow), and [Text Spacing](https://www.w3.org/TR/WCAG22/#text-spacing) success criteria, retrieved 2026-09-24.
