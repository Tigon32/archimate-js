# Rendered read-only app contrast check

Date: 2026-09-24

Provenance: `SYNTHETIC` read-only example in this public repository; no customer model or private data.

Runtime: macOS 26.6.2, Chrome 154.0.8037.58, package 0.0.4.
Method: `test/browser/theme-contrast.mts` loads the actual example HTML, theme script, and app CSS in Chromium. It measures computed sRGB foreground/background colors of the heading, body, label, status, select, and button, plus button hover text, field/status/invalid boundaries, and field focus outline. The test compares unrounded ratios against 4.5:1 ordinary text, 7:1 high-contrast text, and 3:1 measured boundaries/focus.

| Choice / OS preference | Lowest measured text | Lowest measured boundary | Focus outline |
| --- | ---: | ---: | ---: |
| Default / light | 7.79:1 | 4.55:1 | 6.05:1 |
| Default / dark | 9.95:1 | 4.38:1 | 7.76:1 |
| Light | 7.79:1 | 4.55:1 | 6.05:1 |
| Dark | 9.95:1 | 4.38:1 | 7.76:1 |
| High contrast light | 10.28:1 | 9.03:1 | 10.28:1 |
| High contrast dark | 12.54:1 | 7.84:1 | 12.54:1 |

The displayed values are rounded for reading; the executable check compares full precision. The test first exposed a 1.00:1 toolbar button text failure in Light mode. The app-shell link selector applied the link color over the button's action background; scoping the link rule away from `.am-ui-button` fixed it.

This measures the read-only app shell's listed elements and states. It does not measure the full editor, zoom/reflow, forced-colors rendering, user text-spacing overrides, notation content, or assistive-technology journeys. It is therefore a partial result for #136, not a WCAG conformance claim. Manual browser and screen-reader review remains required.

Sources: [WCAG 2.2 SC 1.4.3 text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [SC 1.4.6 enhanced contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html), and [SC 1.4.11 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), W3C, retrieved 2026-09-24. These public explanations are linked and summarized, not copied. Their Understanding pages are informative; the linked WCAG success criteria provide the normative thresholds.
