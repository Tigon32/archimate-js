# DTCG 2025.10 token subset for ArchiMate notation and editor UI

The supplied `assets/archimate-4-kit/` is an unchanged source extract, not a
DTCG token document. Its color leaves are hex strings and its dimensions are
bare numbers. The [Format Module 2025.10, §5 and §8](https://www.designtokens.org/TR/2025.10/format/)
requires a `$value` and an explicit or inherited `$type`; its dimension values
use `{ value, unit }`, and font families use one name or an ordered array.
The [Color Module 2025.10, §4.1–4.2](https://www.designtokens.org/TR/2025.10/color/)
defines structured colors, including `srgb` components in the range 0–1 and
an optional six-digit `hex` fallback. These are final Community Group reports,
not W3C Recommendations.

`scripts/build-notation-assets.mjs` derives `assets/design-tokens/notation.tokens.json`
and the browser/Node `lib/draw/notation.generated.js` from the same pinned kit.
Its `--check` mode verifies all three kit file hashes and exact generated output;
`npm test` runs this check. Rebuild deliberately after changing the generator:
`node scripts/build-notation-assets.mjs`.

| Source kit field | App-owned output | Use |
| --- | --- | --- |
| `color.domain.*.fill`, stroke, grouping, label, canvas | `color` with `srgb` components and hex fallback | Renderer default fills and strokes; scoped notation CSS |
| `box.width`, `box.height`, `line.strokeWidth` | `dimension` in `px` | Box and line defaults |
| Unitless box ratios and typography ratios/count | `number` | Corner geometry and layout hints |
| `typography.family` CSS stack | `fontFamily` ordered names | Font preference |
| Corner type lists, relationship endpoints/patterns, measurement evidence | `org.archimatejs.notation` `$extensions` | Application notation rules and provenance |

The [Format Module, §5.2.3](https://www.designtokens.org/TR/2025.10/format/)
allows vendor-keyed `$extensions`. The renderer uses derived typed values for
representable notation decisions and retains source rules in its adapter.
Model-authored fill, stroke, and connection styles take precedence over notation
defaults. Standalone SVG includes locally scoped notation CSS and symbols.

`assets/design-tokens/app.tokens.json` defines separate semantic app control
colors and spacing. Generated `app.generated.css` scopes light defaults and
explicit dark overrides to `.am-app`; it does not alter `.am-diagram` colors.
The app-shell components in #95 can consume these custom properties as they
are built. These light/dark groups are ordinary Format token groups: this
project does not resolve aliases/references from [Format §7](https://www.designtokens.org/TR/2025.10/format/),
or implement [Resolver Module 2025.10](https://www.designtokens.org/TR/2025.10/resolver/)
sets, modifiers, or interchange. There is no token translation
dependency: two small deterministic outputs and no resolver features do not
yet justify its build and maintenance cost.
