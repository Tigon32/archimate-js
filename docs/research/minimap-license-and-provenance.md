# Minimap package licensing and provenance review (#402)

This note is a documentation-only prerequisite for the "optional minimap"
scope in [EE-M11](roadmap/miro-like-editor-workstream.md) and coordinates
with parent issue [#353](https://github.com/Tigon32/archimate-js/issues/353).
It does not add a minimap dependency, register an `additionalModules` entry,
or implement a minimap. It is not legal advice; unresolved questions are
flagged explicitly in "Open questions" rather than guessed.

All retrieval dates below are **2026-09-26** unless stated otherwise.

## Candidate identification

A public npm/GitHub search for "diagram-js minimap" surfaces exactly one
maintained candidate that actually integrates with diagram-js: the bpmn.io
org's [`diagram-js-minimap`](https://www.npmjs.com/package/diagram-js-minimap)
package, source at
[`bpmn-io/diagram-js-minimap`](https://github.com/bpmn-io/diagram-js-minimap).
No other actively maintained diagram-js-targeting minimap/overview package was
found in this search; this is evidence of the search's own results, not proof
that no other package exists anywhere.

## Package identity, version, and activity

- npm registry metadata (`https://registry.npmjs.org/diagram-js-minimap`,
  retrieved 2026-09-26): `dist-tags.latest` is `5.5.0`, published
  `2026-09-23T11:43:13.310Z` — three days before this review's retrieval
  date. The package's first version, `0.1.0`, was published
  `2017-04-03T13:31:18.474Z`.
- GitHub repository metadata
  (`https://api.github.com/repos/bpmn-io/diagram-js-minimap`, retrieved
  2026-09-26): owner `bpmn-io` (Camunda's open-source org), `pushed_at`
  `2026-09-24T22:15:00Z`, `open_issues_count` 0, `stargazers_count` 37,
  default branch `main`, repository `license.spdx_id` `MIT`.
- Git tags include `v5.5.0` (`https://api.github.com/repos/bpmn-io/diagram-js-minimap/tags`);
  the GitHub Releases list returned by `/releases?per_page=5` shows `v5.4.1`
  as the newest *Release* object as of retrieval, so `v5.5.0` is tagged but a
  corresponding GitHub Release entry may not yet exist or may be filtered by
  pagination — this is an observation, not a claim about release-process
  completeness.
- `CHANGELOG.md`
  (`https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/CHANGELOG.md`)
  documents active, incremental maintenance through 5.2.0–5.5.0 (dependency
  bumps, a hidden-child-element render fix, a z-index fix, and a theme-color
  feature), consistent with ongoing upkeep rather than an abandoned package.

## Generic diagram-js module, not BPMN-specific

- The package `description` is "A minimap for diagram-js"
  (`package.json`, both registry and repository copies).
- `lib/index.js`
  (`https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/lib/index.js`)
  exports a plain diagram-js DI module (`{ __init__: ['minimap'], minimap: [
  'type', Minimap ] }`); `lib/Minimap.js`'s `$inject` array is `['config.minimap',
  'injector', 'eventBus', 'canvas', 'elementRegistry']`
  (`https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/lib/Minimap.js`,
  line ~417) — these are core diagram-js services (`eventBus`, `canvas`,
  `elementRegistry`, `injector`), not any BPMN-specific service name (for
  example no `bpmnjs`, `elementFactory`-with-BPMN-types, or `moddle`
  reference appears in the dependency-injected service list).
- The only non-diagram-js runtime imports in `lib/Minimap.js` are from
  `min-dom`, `tiny-svg`, and `min-dash` (generic DOM/SVG/utility helpers also
  already used elsewhere in this repository's own dependency tree per
  `THIRD_PARTY_NOTICES.md`), plus `diagram-js/lib/util/EscapeUtil`,
  `diagram-js/lib/util/GraphicsUtil`, and `diagram-js/lib/util/IdGenerator`
  — all generic diagram-js utility modules, not BPMN element/model types.
- The README
  (`https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/README.md`)
  demonstrates usage with `bpmn-js`'s `Modeler` purely as *an example host
  application* ("We'll use bpmn-js as an example"), not as a hard
  dependency; the package itself declares no dependency on `bpmn-js`,
  `bpmn-moddle`, or any BPMN-specific package in either `dependencies` or
  `devDependencies`.
- **Conclusion: this is a generic diagram-js overview/navigation module**,
  architecturally comparable to other diagram-js companion packages already
  in this project's dependency graph (for example `diagram-js-direct-editing`
  in this repository's own `package.json`), not a BPMN-specific feature.

## License and transitive dependencies

- `package.json` (`https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/package.json`,
  retrieved 2026-09-26) declares `"license": "MIT"`.
- Repository `LICENSE`
  (`https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/LICENSE`)
  is the standard MIT license text, copyright "2017-present camunda
  Services GmbH".
- Published runtime `dependencies` (registry metadata for `5.5.0`):
  `min-dash: ^5.0.0`, `min-dom: ^5.3.0`, `tiny-svg: ^4.1.4`. All three are
  bpmn.io-maintained MIT packages already declared in this repository's own
  `THIRD_PARTY_NOTICES.md` MIT list (`min-dash`, `min-dom`, `tiny-svg`), so
  adopting `diagram-js-minimap` would not introduce a *new* license family
  into the dependency tree at this direct-dependency level; the resolved
  transitive tree should still be checked at actual adoption time via
  `npm audit`/the existing supply-chain gate, consistent with this
  repository's stated "direct-dependency inventory" caveat in
  `THIRD_PARTY_NOTICES.md`.
- No `peerDependencies` field is present in the published `package.json`;
  `diagram-js` appears only as a `devDependency` (`^15.18.1` for the 5.5.0
  test suite), matching this repository's currently pinned `diagram-js`
  version (`15.26.0`, from this repository's `package.json`) within the
  same major version. The absence of a declared peer dependency means npm
  will not automatically warn on a diagram-js version mismatch; compatibility
  must be verified manually (see "Open questions").
- `assets/diagram-js-minimap.css`
  (`https://api.github.com/repos/bpmn-io/diagram-js-minimap/contents/assets`,
  2,467 bytes) is the only bundled non-code asset; it is plain CSS, not a
  font or image asset, so it does not raise the OFL/font-notice pattern this
  repository already tracks for `archimate-font`/Font Awesome in
  `THIRD_PARTY_NOTICES.md`. The CHANGELOG's 5.5.0 entry ("source colors and
  corner radius from `@bpmn-io/theme`") refers to `@bpmn-io/theme` as a
  build-time devDependency used to generate/lint this CSS file's design
  tokens, not a runtime dependency shipped to consumers — `@bpmn-io/theme`
  does not appear in the published `dependencies` field.

## Browser/SVG rendering and styling implications

- The minimap renders as an SVG-based overview embedded in a plain `<div>`
  appended to the canvas container (`lib/Minimap.js`'s `_init` creates a
  `document.createElement('div')` parent and uses `tiny-svg` `svgCreate`/
  `svgAppend` for its content), consistent with this project's existing
  `tiny-svg`-based rendering approach elsewhere in the dependency tree.
- Correct visual rendering requires separately linking the package's
  `assets/diagram-js-minimap.css` stylesheet (per its README); this is an
  additional static asset this repository would need to serve or bundle if
  adopted, distinct from the JS module registration.
- This repository's "Deterministic SVG/report rendering" priority (35%
  ArchiMate semantics weight aside, per this repository's stated
  architecture priorities) concerns model/report SVG export, not the
  interactive minimap overview; no evidence was found that this package
  participates in or alters this repository's report/export SVG rendering
  path — the minimap is a live-canvas navigation aid only, not a
  reviewed/exported artifact per current evidence.

## Repository/package artifact summary

| Item | Value | Source |
| --- | --- | --- |
| npm package | `diagram-js-minimap` | `https://www.npmjs.com/package/diagram-js-minimap` |
| Latest version | `5.5.0`, published 2026-09-23 | `https://registry.npmjs.org/diagram-js-minimap` |
| Source repository | `bpmn-io/diagram-js-minimap` | `https://github.com/bpmn-io/diagram-js-minimap` |
| License | MIT | package `LICENSE`, `package.json` |
| Runtime dependencies | `min-dash`, `min-dom`, `tiny-svg` (all MIT) | registry `5.5.0` metadata |
| `diagram-js` relationship | devDependency only (`^15.18.1`), no declared peerDependency | repository `package.json` |
| BPMN coupling | None found in source imports or manifest; README uses bpmn-js only as an example host | `lib/index.js`, `lib/Minimap.js`, `package.json` |
| Maintenance signal | Active: pushed 2026-09-24, 0 open issues, incremental CHANGELOG through 5.5.0 | GitHub API, `CHANGELOG.md` |

## Alternative: a project-owned minimal overview

This repository's own `Canvas`/viewport adapter (once an editor
adapter/viewport API exists per the EE-M11/EE-M8 plan in
`docs/roadmap/miro-like-editor-workstream.md`) could in principle render a
small SVG overview using only data already available from diagram-js's
`canvas`/`elementRegistry` services, without adding a new npm dependency.
This would avoid:

- Any additional license entry in `THIRD_PARTY_NOTICES.md`.
- The extra CSS asset delivery and its integration with this repository's
  own theming system (rather than relying on the package's own
  `@bpmn-io/theme`-derived styling).
- Any future maintenance dependency on `bpmn-io/diagram-js-minimap`'s own
  release cadence, API surface, and support for the ArchiMate-specific
  element/relationship types this project renders (which the third-party
  package was never designed or tested against, since it is BPMN-oriented in
  its examples/testing even though it is API-generic).

It would cost: original implementation and test effort, and forgone
upstream maintenance/bug fixes (the CHANGELOG shows the upstream project has
already fixed real rendering/performance issues at 5.4.0/5.4.1 that a
from-scratch implementation would need to rediscover independently). This
note does not implement either path; it records the trade-off for the
EE-M11 decision point.

## Required repository changes before adoption (not yet made)

None of the following exist yet, consistent with this issue's
documentation-only scope. If EE-M11 proceeds to add `diagram-js-minimap`:

1. Add a `THIRD_PARTY_NOTICES.md` entry naming `diagram-js-minimap`, its
   resolved version, MIT license, and the upstream repository URL, following
   the existing direct-dependency list convention in that file.
2. Verify the resolved `min-dash`/`min-dom`/`tiny-svg` versions pulled in by
   `diagram-js-minimap` do not conflict with this repository's own pinned
   versions of the same packages (both already MIT direct dependencies here)
   and resolve any duplicate-version bundling via the existing lockfile.
3. Confirm actual runtime compatibility with `diagram-js@15.26.0` by
   integration-testing the module (the published package only tests against
   `^15.18.1` as a devDependency; no peerDependency range is declared to
   enforce this automatically).
4. Decide how to serve `assets/diagram-js-minimap.css` (bundling vs. a
   separate static asset) and reconcile its `@bpmn-io/theme`-derived colors
   with this project's own theming system referenced in
   `docs/research/dtcg-2025-10-implementation.md` and
   `docs/research/modeler-theme-contrast-2026-09-26.md`, if those exist and
   are relevant at adoption time.
5. Verify the resolved package tarball against the npm registry's published
   integrity hash for the pinned version, consistent with this repository's
   existing `test:supply-chain` gate.
6. Update `docs/roadmap/miro-like-editor-workstream.md`'s EE-M11 row outcome
   once a concrete adopt/defer/reject decision is made; this note only
   records evidence, not a final decision.

## Risks and open questions

- **No declared peerDependency range.** `diagram-js-minimap` does not pin a
  supported `diagram-js` version via `peerDependencies`; compatibility with
  this repository's `diagram-js@15.26.0` (newer than the package's own
  `^15.18.1` devDependency range) is inferred from same-major-version
  proximity, not confirmed by an explicit compatibility statement from the
  maintainers. This should be integration-tested, not assumed, before
  adoption.
- **ArchiMate-type rendering fidelity is untested by upstream.** The
  package's own tests and examples target BPMN diagrams; there is no public
  evidence it has been tested against this project's ArchiMate element and
  relationship rendering. Visual correctness for ArchiMate-specific shapes
  would need to be verified here, not assumed from BPMN usage.
- **GitHub Releases vs. tags discrepancy.** `v5.5.0` is tagged but was not
  the newest entry returned by a `/releases?per_page=5` query at review
  time; this may reflect release-process timing or pagination behavior on
  the bpmn-io side and was not further investigated. It does not by itself
  indicate a supply-chain or provenance problem, but it is recorded as an
  observation for anyone re-verifying this note later.
- **This is not legal advice.** The MIT-license and dependency-tree analysis
  above is a repository-policy interpretation of public license text and
  public package metadata, not a legal opinion. A qualified legal reviewer
  should confirm before actual adoption, per this repository's standing
  practice recorded in `docs/research/elkjs-license-and-provenance.md`.

## Recommendation

**No adoption decision is made by this note.** The evidence above shows
`diagram-js-minimap` is (a) genuinely diagram-js-generic rather than
BPMN-specific, (b) MIT-licensed with an MIT-only direct-dependency tree that
overlaps with packages already vetted in `THIRD_PARTY_NOTICES.md`, and (c)
actively maintained as of 2026-09-23. These factors make it a *plausible*
candidate if EE-M11 chooses to add a minimap dependency. However, the
project-owned minimal-overview alternative above avoids the open
peerDependency/compatibility and ArchiMate-fidelity questions entirely and
may be the lower-risk path if the minimap remains a small, optional feature.
**This note recommends that EE-M11 treat the decision as open, weighing this
evidence against implementation effort, and defer a final adopt/defer/reject
call to that issue rather than deciding it here.** If EE-M11 defers or
rejects the dependency (for example because the ArchiMate-fidelity or
peerDependency risk is judged too high relative to the "Convenience
features" 5% priority weight for this project), that is a legitimate
evidence-based outcome of this review, not a gap in it.

## Public sources

- [`diagram-js-minimap` npm package](https://www.npmjs.com/package/diagram-js-minimap)
  and [npm registry metadata](https://registry.npmjs.org/diagram-js-minimap),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap`](https://github.com/bpmn-io/diagram-js-minimap)
  repository, retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` GitHub API metadata](https://api.github.com/repos/bpmn-io/diagram-js-minimap),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` `README.md`](https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/README.md),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` `package.json`](https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/package.json),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` `LICENSE`](https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/LICENSE),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` `CHANGELOG.md`](https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/CHANGELOG.md),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` `lib/index.js`](https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/lib/index.js),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` `lib/Minimap.js`](https://raw.githubusercontent.com/bpmn-io/diagram-js-minimap/master/lib/Minimap.js),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` `assets/` directory listing](https://api.github.com/repos/bpmn-io/diagram-js-minimap/contents/assets),
  retrieved 2026-09-26.
- [`bpmn-io/diagram-js-minimap` Git tags](https://api.github.com/repos/bpmn-io/diagram-js-minimap/tags),
  retrieved 2026-09-26.
- [`bpmn-io/bpmn-js-examples` minimap example](https://github.com/bpmn-io/bpmn-js-examples/tree/main/minimap),
  referenced by the README as a detailed integration example (not fetched in
  full for this note; the README itself is cited as primary evidence).
