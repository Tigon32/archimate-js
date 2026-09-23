# BDD and browser harness recommendation

## Recommendation

Use Playwright for browser/component journeys once deterministic public fixtures and SVG output exist.

## Why Playwright

| Criterion | Playwright fit |
|---|---|
| Node.js 24/22 support | Maintained and compatible with current Node lines |
| Browser coverage | Chromium-first now; Firefox/WebKit later if needed |
| Report journeys | Strong page, locator, and screenshot tooling |
| CI cost | Can start headless and run only on synthetic fixtures |
| BDD integration | Can execute steps behind Gherkin feature files without coupling scenarios to implementation details |

## Frugal sequencing

1. Keep current smoke tests as the fast gate.
2. Add Vitest for pure import/validation/render seams.
3. Add Playwright only when one deterministic synthetic fixture and SVG export seam exist.
4. Add screenshot/image-diff checks after fonts and SVG serialization are stable.

## First browser scenario

Load a minimal HTML harness that imports the library, renders the synthetic fixture's selected view, exports SVG, and asserts that HTML and Markdown-image paths reference the same SVG artifact identity.

## Related issues

- #8
- #13
- #14
