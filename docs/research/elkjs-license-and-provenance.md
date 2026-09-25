# ELK.js licensing and provenance review (#374)

This note is a documentation-only prerequisite for [EE-M12](roadmap/miro-like-editor-workstream.md)
and coordinates with [#100](https://github.com/Tigon32/archimate-js/issues/100)
and [#354](https://github.com/Tigon32/archimate-js/issues/354). It does not
add the `elkjs` dependency or implement a layout strategy. It is not legal
advice; unresolved questions are flagged explicitly rather than guessed.

All retrieval dates below are **2026-09-26** unless stated otherwise.

## Package and version inspected

- npm package: [`elkjs`](https://www.npmjs.com/package/elkjs). The npm
  registry's `dist-tags.latest` was `0.12.0` as of retrieval
  (`https://registry.npmjs.org/elkjs`).
- Upstream source: [`kieler/elkjs`](https://github.com/kieler/elkjs), tag
  [`0.12.0`](https://github.com/kieler/elkjs/tree/0.12.0). The repository's
  `master` branch (unreleased, at `0.13.0` in `package.json`) carries the
  same license declaration.
- `elkjs` is the JavaScript packaging of the Java-based
  [Eclipse Layout Kernel (ELK)](https://www.eclipse.org/elk/), compiled to
  JavaScript with GWT (Google Web Toolkit); see the elkjs README's opening
  paragraph and "Files" section
  (`https://raw.githubusercontent.com/kieler/elkjs/0.12.0/README.md`).

## License expression and what `OR` means

- `elkjs@0.12.0`'s `package.json` declares
  `"license": "EPL-2.0 OR GPL-3.0-or-later"`
  (`https://raw.githubusercontent.com/kieler/elkjs/0.12.0/package.json`).
- The repository's top-level `LICENSE.md` contains the full Eclipse Public
  License 2.0 (EPL-2.0) text
  (`https://raw.githubusercontent.com/kieler/elkjs/master/LICENSE.md`).
- The upstream Java project's `NOTICE.md` explains the mechanism directly:
  > "This program and the accompanying materials are made available under
  > the terms of the Eclipse Public License 2.0 ... This Source Code may
  > also be made available under the following Secondary Licenses when the
  > conditions for such availability set forth in the Eclipse Public
  > License v. 2.0 are satisfied: GPL-3.0 ... SPDX-License-Identifier:
  > EPL-2.0 OR GPL-3.0-or-later"
  (`https://raw.githubusercontent.com/eclipse/elk/master/NOTICE.md`).
- This is EPL-2.0's own "Secondary License" clause (EPL-2.0 §1 definitions
  and §3.2(a), Exhibit A), not an independent dual-license choice by the
  elkjs maintainers: EPL-2.0 lets an initial contributor attach a notice
  permitting recipients to *also* receive EPL-covered source under a
  Secondary License (here, GPL-3.0-or-later) when combined with material
  distributed under that Secondary License
  (`https://opensource.org/license/epl-2-0`, §§1, 3.2(a)). The SPDX `OR`
  operator (`EPL-2.0 OR GPL-3.0-or-later`) means a recipient may choose
  *either* license for their own compliance; it is not both simultaneously.
  Evidence: SPDX license expression semantics for `OR`
  (`https://spdx.github.io/spdx-spec/v2-draft/SPDX-license-expressions/`,
  section 2, "one, but not necessarily both, of the licenses ... may be
  chosen").

## Likely preferred path for this MIT package

This repository ships under MIT with no GPL-licensed dependency intentionally
included (`THIRD_PARTY_NOTICES.md`, "No GPL-licensed dependency or asset is
intentionally included in the project."). **EPL-2.0 is the supportable
choice, not GPL-3.0-or-later**, for the following evidence-based reasons:

- EPL-2.0 is a file-scoped weak-copyleft license: source-disclosure and
  license-application obligations attach to the EPL-covered Program and to
  files a distributor modifies, not to the whole combined work distributed
  alongside it (EPL-2.0 §§3.1, 3.3; `https://opensource.org/license/epl-2-0`).
  Choosing GPL-3.0-or-later instead would extend copyleft to the combined
  work under ordinary GPL "combined work" analysis
  (`https://www.gnu.org/licenses/gpl-3.0.html`, §5), which is inconsistent
  with keeping other MIT/Apache-2.0/ISC/OFL-1.1 dependencies undisturbed
  as recorded in `THIRD_PARTY_NOTICES.md`.
- Using elkjs unmodified (no source edits to its published `lib/` files)
  keeps the EPL-2.0 obligations to: (a) make the elkjs Source Code available
  under EPL-2.0 (satisfied by linking to the public npm/GitHub source,
  EPL-2.0 §3.1(a)); (b) not remove or alter its notices (EPL-2.0 §3.3); and
  (c) accompany distributed copies with the EPL-2.0 text (EPL-2.0 §3.2(b)).
  No obligation to relicense this repository's own code arises from mere
  aggregation/linking under EPL-2.0 (weak copyleft is per-file/per-Program,
  not per-application).

This is a repository-policy interpretation of public license text, not legal
advice on a specific distribution scenario; a legal review before adoption is
still advisable if the project proceeds (see "Open questions" below).

## Source, notice, modified-file, network, and browser-bundle considerations

- **Source availability.** elkjs's Source Code is already public at
  `https://github.com/kieler/elkjs`, satisfying EPL-2.0 §3.1(a)'s "informs
  Recipients how to obtain it" requirement by reference, provided this
  repository does not vendor a modified copy without also publishing the
  modified source.
- **Notices.** EPL-2.0 §3.3 forbids removing/altering existing notices.
  elkjs's own repository does not currently ship a separate `NOTICE` file
  (only `LICENSE.md`); this repository would still need to add its own
  `THIRD_PARTY_NOTICES.md` entry naming elkjs, its license, and the upstream
  URL, matching the existing entries for MIT/ISC/Apache-2.0/OFL-1.1
  dependencies.
- **Modified files.** This project currently plans to consume elkjs as an
  unmodified npm dependency behind `src/layout`'s `'elk-layered'` strategy
  boundary (`docs/roadmap/miro-like-editor-workstream.md`, Layout section).
  If elkjs itself is never patched/vendored-and-edited, the heavier
  modified-Program obligations in EPL-2.0 §3.1(a)/§3.3 (documenting changes)
  do not apply; only the unmodified-distribution obligations do.
- **Network use.** EPL-2.0 has no network-copyleft ("SaaS loophole") clause
  comparable to AGPL-3.0; it is triggered by "Distribute," defined as
  distributing or making available in a way that enables transfer of a copy
  (EPL-2.0 §1, `https://opensource.org/license/epl-2-0`). Serving the
  compiled browser bundle to end users over the network is a form of making
  the Program available and is treated the same as a discrete file
  distribution for EPL-2.0 purposes; there is no separate, stricter
  network-use trigger the way there would be under AGPL-3.0/GPL-3.0's
  Section 13 discussions for combined works served as a network service
  (`https://www.gnu.org/licenses/gpl-3.0.html`).
- **Browser bundling.** Bundling elkjs's compiled `elk-worker.js`/
  `elk.bundled.js` into this project's own browser artifacts is still a
  "Distribute" act under EPL-2.0 (making the Program available for transfer
  to users' browsers). It does not, by itself, convert the combined
  artifact into a single "Program" requiring the *rest* of the bundle to be
  EPL-2.0-licensed, because EPL-2.0's copyleft is scoped to the Program
  and Modified/Derivative Works of it (EPL-2.0 §1 "Program", "Modified
  Works"), not to mere aggregation in one build output. This repository
  would still need to keep the EPL-2.0 text available to recipients of the
  bundle (§3.2(b)) and preserve elkjs's own notices within its shipped
  files (§3.3).

## WASM/worker/minified artifacts

- No WebAssembly artifacts were found; elkjs is GWT-compiled JavaScript, not
  WASM.
- The published npm package (and the `0.12.0` Git tag) includes checked-in
  build outputs under `lib/`: `elk-api.js`, `elk-worker.js` (~4.7 MB,
  GWT-generated, unminified), `elk-worker.min.js` (~1.6 MB, minified),
  `elk.bundled.js` (~1.6 MB, browserify bundle for `<script>` tags),
  `main.js`, and `.d.ts` type declarations
  (`https://api.github.com/repos/kieler/elkjs/contents/lib?ref=0.12.0`).
  `elk-worker.js`'s header contains only generated variable declarations and
  GWT runtime shims, with no per-file copyright/license header
  (`https://raw.githubusercontent.com/kieler/elkjs/0.12.0/lib/elk-worker.js`).
  The repository-level `LICENSE.md` and `package.json` `license` field are
  the operative notices for the package as a whole; there is no evidence of
  a required per-file header inside the generated artifacts themselves.
- elkjs's Node entry point (`elk.js`/`main.js`) offloads layout to a Web
  Worker/`worker_threads` implementation depending on environment
  (README "Files" section); this does not change the licensing analysis,
  since the worker script is simply another distributed copy of the same
  EPL-2.0-or-GPL-3.0-or-later Program.

## Transitive dependencies and assets

- `elkjs@0.12.0`'s runtime `dependencies` field is absent from its published
  `package.json`; only `devDependencies` (Babel, browserify, chai, mocha,
  mkdirp, `web-worker`) are declared
  (`https://raw.githubusercontent.com/kieler/elkjs/0.12.0/package.json`).
  `web-worker` (an npm package providing a cross-environment Worker
  polyfill) appears only as a devDependency for elkjs's own build/test, not
  as a published runtime dependency of the `elkjs` npm package; this should
  be re-verified against the resolved lockfile at actual adoption time
  rather than assumed from this note.
- No bundled fonts, images, or other non-code assets were found in the
  package's `files` allowlist (`["lib"]` only).

## Required repository changes before adoption (not yet made)

None of the following exist yet, consistent with this issue's "documentation
gate only" scope. If EE-M12 proceeds to actually add `elkjs`:

1. Add a `THIRD_PARTY_NOTICES.md` entry naming `elkjs`, its resolved version,
   `EPL-2.0` as the selected license path (recording the `OR
   GPL-3.0-or-later` Secondary License option was declined), and the
   upstream repository URL, following the existing table/paragraph
   conventions in that file.
2. Decide, and record the decision, on whether to vendor a copy of
   `LICENSE.md`/EPL-2.0 text under a package-specific notices path (for
   example alongside other bundled-license copies referenced from
   `THIRD_PARTY_NOTICES.md`) or link to the canonical EPL-2.0 text and the
   package's own `LICENSE.md`; either satisfies §3.2(b) if the text remains
   reachable to recipients of any distributed browser bundle.
3. Record the resolved `elkjs` version and integrity hash in `package.json`
   / the lockfile as normal dependency-provenance practice; no extra
   manifest field is defined by this repository's current provenance
   tooling (`docs/security/provenance.md`) for third-party npm packages
   beyond the existing `npm audit`-covered dependency tree noted in
   `THIRD_PARTY_NOTICES.md`.
4. If this repository maintains or plans an SBOM, add `elkjs` with its
   `EPL-2.0` license selection once the dependency is actually introduced.
   No SBOM tooling reference was found in the reviewed docs during this
   review; this is an open item, not a claim that one exists.
5. Verify the resolved package tarball against the npm registry's published
   `dist.integrity`/`shasum` for the pinned version as ordinary
   supply-chain practice, consistent with this repository's existing
   `test:supply-chain` gate.
6. Update `docs/roadmap/miro-like-editor-workstream.md`'s EE-M12 row outcome
   once a concrete adoption or rejection decision is made (this note only
   records the license-path evidence, not a final adoption decision).

## Risks and open questions

- **Unverified transitive-dependency completeness at adoption time.** This
  review read the published `package.json`'s `devDependencies`, not a
  resolved lockfile; re-verify actual runtime transitive dependencies (if
  any appear) when `elkjs` is actually installed.
- **No per-file license headers inside generated artifacts.** `elk-worker.js`
  and its minified/bundled siblings carry no embedded copyright header. This
  note treats the package-level `LICENSE.md` and `package.json` `license`
  field as the operative notice, consistent with typical npm packaging
  practice, but this is an inference rather than an explicit statement from
  the upstream project confirming that treatment.
- **EPL-2.0 "Distribute" scope for a served single-page browser bundle.**
  This note's browser-bundling analysis follows the EPL-2.0 text's own
  "Distribute" definition and weak-copyleft scoping; it does not constitute
  a legal opinion on this repository's specific bundling and hosting
  architecture. A qualified legal reviewer should confirm before the
  dependency is actually adopted, especially regarding exactly what
  "accompanying" the EPL-2.0 text with a served single-page app bundle
  should look like in practice.
- **GPL-3.0-or-later path not evaluated for adoption.** This note does not
  fully analyze the GPL-3.0-or-later alternative's combined-work
  obligations beyond noting that they are broader than EPL-2.0's and appear
  incompatible with this repository's stated "no GPL dependency" policy in
  `THIRD_PARTY_NOTICES.md`; that policy statement is treated as the binding
  repository decision here.

## Recommendation

**ACCEPT the EPL-2.0 license path as supportable for future adoption,
conditioned on the repository changes in "Required repository changes"
above being completed at the time `elkjs` is actually introduced.** This
note itself makes no dependency or code change; EE-M12 should implement
those repository changes together with the actual `elkjs` addition, not
before, per this issue's documentation-only scope. Do not select the
GPL-3.0-or-later path: it is legally available per elkjs's license
expression but is inconsistent with this repository's current no-GPL
policy recorded in `THIRD_PARTY_NOTICES.md`.

## Public sources

- [`elkjs` npm package](https://www.npmjs.com/package/elkjs) and
  [npm registry metadata](https://registry.npmjs.org/elkjs), retrieved
  2026-09-26.
- [`kieler/elkjs`](https://github.com/kieler/elkjs) repository, tag
  [`0.12.0`](https://github.com/kieler/elkjs/tree/0.12.0), retrieved
  2026-09-26.
- [`kieler/elkjs` `LICENSE.md`](https://github.com/kieler/elkjs/blob/master/LICENSE.md),
  retrieved 2026-09-26.
- [`kieler/elkjs` `package.json`](https://github.com/kieler/elkjs/blob/0.12.0/package.json),
  retrieved 2026-09-26.
- [`kieler/elkjs` `README.md`](https://github.com/kieler/elkjs/blob/0.12.0/README.md),
  retrieved 2026-09-26.
- [`eclipse/elk` `NOTICE.md`](https://github.com/eclipse/elk/blob/master/NOTICE.md),
  retrieved 2026-09-26.
- [Eclipse Public License 2.0, full text via OSI](https://opensource.org/license/epl-2-0),
  retrieved 2026-09-26.
- [Eclipse Public License 2.0, canonical Eclipse Foundation page](https://www.eclipse.org/legal/epl-2.0/),
  retrieved 2026-09-26 (JavaScript-rendered; canonical URL cited, full text
  cross-checked against the OSI mirror above).
- [SPDX license expression specification, `OR` operator](https://spdx.github.io/spdx-spec/v2-draft/SPDX-license-expressions/),
  retrieved 2026-09-26.
- [GNU General Public License v3.0, full text](https://www.gnu.org/licenses/gpl-3.0.html),
  retrieved 2026-09-26 (consulted only for combined-work/Section 5
  implications, not reproduced here).
