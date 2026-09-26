# App shell style layer

`assets/design-tokens/app.tokens.json` holds application-control tokens as
DTCG 2025.10 `color`, `dimension`, `fontFamily`, and `number` leaves. Run
`node scripts/build-notation-assets.mjs` to regenerate
`assets/design-tokens/app.generated.css`; `npm run test:tokens` checks drift.
The generated selectors define `--am-ui-*` properties on `.am-app` and its
explicit `data-theme="light"`, `"dark"`, `"high-contrast-light"`, and
`"high-contrast-dark"` modes. They do not define notation variables
or modify `.am-diagram`. The source kit in `assets/archimate-4-kit/` stays intact.

The public `archimate-js/app-shell.css` stylesheet consumes those values for
reusable `.am-ui-toolbar`, `.am-ui-panel`, `.am-ui-status`, `.am-ui-button`, and
`.am-ui-field` classes, plus `.am-ui-dialog` and `.am-ui-inspector` surfaces.
Add `.am-app` to the host element containing controls and the canvas;
the stylesheet has no page-wide element resets. The read-only example applies
the link/button style and status states. The palette supplied by diagram-js
inherits the same tokens when rendered under that root. The package contains
IBM Plex Regular and SemiBold under OFL; these are the app control fonts and
use no remote URL.

| Component | States and authoring contract |
| --- | --- |
| Button/link | Default and hover; `:focus-visible` outline; native `disabled` for buttons, `aria-disabled="true"` for links that are made noninteractive by application logic. |
| Field | Default and `:focus-visible`; `:disabled` and `aria-invalid="true"` indicate disabled and invalid states. Include a visible text error with an invalid field. |
| Status | `role="status"` for nonurgent updates, `data-state="success"`, `"warning"`, or `"error"` for border state. Announce urgent errors appropriately in the consuming application. |
| Panel/toolbar | Container styles and spacing; controls keep their own keyboard behavior and labels. |
| Palette | diagram-js entries and toggle inherit application colors; hover, selected, disabled, and `:focus-visible` states use the same app tokens. Palette keyboard activation belongs to #96. |
| Dialog/inspector | `.am-ui-dialog` and `.am-ui-inspector` share the panel surface; fields, buttons, and status text use the documented states above when those controls are created under #96. |

Light and dark text, muted text, primary action, hover, and disabled text
combinations are checked against a 4.5:1 contrast threshold; visible borders
and focus against the surrounding surface are checked against 3:1. These
thresholds follow [WCAG 2.2 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum),
[Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast), and
[Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible). The checks cover
the named color pairs, not every possible host background or focus overlap.

The legacy `assets/archimate-js.css` now imports the scoped app shell and uses
only local font assets. Its application selectors are scoped beneath `.am-app`;
integrators importing that legacy stylesheet must wrap their controls and
canvas with that class. The separately supplied diagram-js and ArchiMate font
styles remain vendor-owned inputs to a CSS-capable bundler. Neither the app
theme nor the scoped legacy rules change ArchiMate notation colors or an
explicit model-authored fill. #96 will add functional editor dialogs,
inspector, palette keyboard actions, and their interaction checks when those
controls exist. The read-only example's native browser `.js` module is retained
for Node 22/static-server compatibility. The browser smoke `.mjs` runner is
covered by its narrow source-policy exception until its typed runner exists.
## Theme selection and migration (#136)

The public CSS contract is the `.am-app` root and its `data-theme` attribute.
An absent attribute retains the original light palette; existing hosts setting
`data-theme="dark"` continue to work as a migration path for pre-chooser hosts.
Set the attribute on the app root only, never on the diagram or an exported SVG.
The example-owned persistence contract is implemented in
`examples/read-only/theme.js`; it is a reference implementation for the
read-only embed, not a package API. The example's native labeled select offers
Default, Light, Dark, High contrast light, and High contrast dark. It stores the
current choice under `localStorage['archimate-js.ui-theme']` when storage is
available. On load, a valid saved value takes precedence over the visible
default, and invalid saved values are ignored. With no saved choice, Default
follows the OS dark/light preference; explicit Default also follows the OS.
Light, Dark, and either high contrast choice override that preference and
survive reload and view changes. If storage is blocked, reads and writes are
ignored without surfacing an error; the selected choice lasts for the current
page lifetime only and resets on reload. The example resolves Default into
`data-theme="light"` or `"dark"` and updates on OS preference changes; explicit
choices do not change when the OS preference changes. Hosts may use the same
policy or set an explicit `data-theme` mode directly. Native select text and its
accessible name expose the active choice and support keyboard and pointer input.
The Chromium automation covers keyboard-only choice changes with native select
typeahead. Headless Chromium does not expose the macOS native select popup as
clickable page DOM, so the pointer evidence renders the same native select as a
test-only five-row listbox with the `size` attribute and clicks each real
`option`; this keeps product markup unchanged while asserting pointer-driven
`input` and `change` events update `data-theme`. The read-only example has one
visible view and no public multi-view switcher; the browser evidence serves a
two-view synthetic fixture and calls the mounted viewer's `openView` method
without reloading to prove the theme state survives a view change.

The new semantic roles cover link/icon colors, hover/pressed/selected/invalid
surfaces, overlays, status borders, focus, and disabled controls. Status states
include a visible symbol in addition to color; consuming applications should
also supply readable status text. Native controls receive `color-scheme`; the
forced-colors rules use system colors and keep borders and focus visible. There
is no theme-switch animation, and reduced-motion suppresses app transitions.
The generated variables are scoped to UI only. Diagram notation, explicit
model colors, and export styles continue to use their separate sources.

### Token roles and legacy migration

The stable theme roles are the `--am-ui-*` variables generated from
`assets/design-tokens/app.tokens.json`: text, muted text, link, icon, action,
hover, selected, invalid, disabled, overlay, status, border, focus, spacing,
radii, and app font roles. Use those roles from `.am-app` descendants instead
of hard-coded theme colors. Keep `data-theme` on the `.am-app` root; legacy
hosts that already set `data-theme="dark"` remain supported, while new hosts
should prefer the five selector choices documented above. Migrating from
`assets/archimate-js.css` means wrapping controls and the canvas in `.am-app`
and replacing legacy app-control selectors with `.am-ui-*` classes. Do not move
these variables onto `.am-diagram`, exported SVG, or model-authored notation
styles.

These controls are currently present in the read-only embed: toolbar, theme
select, navigation link, and status. The modeler chrome and canvas interaction
layer are gated by `test/browser/modeler-theme-contrast.mts` (#389). Panel,
dialog, inspector, tree, and palette/picker surfaces do not exist yet; each
inherits the #136 theme gate through its own issue (#351, #356, #361, #363,
#364). The consolidated evidence for #136 is in
[`docs/research/theme-accessibility-matrix-2026-09-26.md`](../research/theme-accessibility-matrix-2026-09-26.md).

### Verification snapshot (2026-09-24)

The minimum in each row spans 14 named normal-text pairs and five essential
object/boundary pairs in the checked-in tokens, measured with the WCAG sRGB
luminance formula. Default resolves to Light or Dark according to OS preference.

| Mode | Platform/check | Minimum text | Minimum object | Findings and limits |
| --- | --- | ---: | ---: | --- |
| Light | Node token test | 6.18:1 | 4.55:1 | Named pairs pass; rendered states pending browser review. |
| Dark | Node token test | 6.06:1 | 4.38:1 | Named pairs pass; rendered states pending browser review. |
| High contrast light | Node token test | 8.66:1 | 9.19:1 | Named pairs pass; focus area/overlays pending visual review. |
| High contrast dark | Node token test | 8.97:1 | 9.62:1 | Named pairs pass; focus area/overlays pending visual review. |
| All five choices | Chromium CI smoke | Pending | Pending | Selector keyboard, reload, OS preference, forced-colors emulation, and diagram fills are automated; no local Chromium executable was available for this snapshot. |

Token ratios do not certify a rendered page. Platform forced-colors palettes,
text spacing, 200% text resize, 400% zoom/reflow, and VoiceOver/NVDA still need
manual checks on the actual application. Disabled controls have the WCAG
inactive-component exception; readable disabled colors are provided here as
an additional design choice.
