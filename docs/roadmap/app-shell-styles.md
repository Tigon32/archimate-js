# App shell style layer: first slice of issue #95

`assets/design-tokens/app.tokens.json` holds application-control tokens as
DTCG 2025.10 `color`, `dimension`, `fontFamily`, and `number` leaves. Run
`node scripts/build-notation-assets.mjs` to regenerate
`assets/design-tokens/app.generated.css`; `npm run test:tokens` checks drift.
The generated selectors define `--am-ui-*` properties on `.am-app` and its
explicit dark mode (`data-theme="dark"`). They do not define notation variables
or modify `.am-diagram`. The source kit in `assets/archimate-4-kit/` stays intact.

The public `archimate-js/app-shell.css` stylesheet consumes those values for
reusable `.am-ui-toolbar`, `.am-ui-panel`, `.am-ui-status`, `.am-ui-button`, and
`.am-ui-field` classes. Add `.am-app` to the host element containing controls;
the stylesheet has no page-wide element resets. The read-only example applies
the link/button style and status states. The package contains IBM Plex Regular
and SemiBold under OFL; these are the app control fonts and use no remote URL.

| Component | States and authoring contract |
| --- | --- |
| Button/link | Default and hover; `:focus-visible` outline; native `disabled` for buttons, `aria-disabled="true"` for links that are made noninteractive by application logic. |
| Field | Default and `:focus-visible`; `:disabled` and `aria-invalid="true"` indicate disabled and invalid states. Include a visible text error with an invalid field. |
| Status | `role="status"` for nonurgent updates, `data-state="success"`, `"warning"`, or `"error"` for border state. Announce urgent errors appropriately in the consuming application. |
| Panel/toolbar | Container styles and spacing; controls keep their own keyboard behavior and labels. |

Light and dark text, muted text, primary action, hover, and disabled text
combinations are checked against a 4.5:1 contrast threshold; visible borders
and focus against the surrounding surface are checked against 3:1. These
thresholds follow [WCAG 2.2 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum),
[Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast), and
[Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible). The checks cover
the named color pairs, not every possible host background or focus overlap.

Remaining #95 work: integrate this layer into the editor toolbar, palette,
dialogs, inspector, and status UI as those features are built after #94/#96;
remove the page-wide resets and remote Typekit/Quicksand imports from the
separate legacy `assets/archimate-js.css` when that stylesheet is migrated;
then test all interactive states in the finished editor. The read-only
example's native browser `.js` module is retained for Node 22/static-server
compatibility after two status-state assignments; migrate it to TypeScript
when the example has a TypeScript build step. The existing browser smoke `.mjs`
runner is covered by its narrow source-policy exception until its typed runner
is available.
