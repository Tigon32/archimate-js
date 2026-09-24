# Product independence and TypeScript roadmap

## Decision to make first

“Not linked to `archimate-js` anymore” can mean three different things. Treat
them as separate acceptance goals:

| Goal | What changes | What it does not do |
| --- | --- | --- |
| Product identity | New product name, package, CLI, docs, website, and repository location. | It does not make inherited source independently authored or erase the fork's history. |
| Repository identity | A new GitHub repository and, if desired, a fresh public history. Keep a provenance record linking to the source fork. | It does not change source-code authorship or remove license obligations. |
| Implementation independence | Replace inherited implementation modules with independently designed and authored equivalents. | It does not permit removal of copyright/license notices that still apply to retained source or assets. |

The repository currently identifies itself as a public MIT fork in
[`UPSTREAM.md`](../../UPSTREAM.md) and records inherited source and asset notices
in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md). Preserve applicable
notices throughout a rebrand. Rename and code replacement are not substitutes
for a file-level provenance and license review.

## Recommended sequence

Do not start with a big-bang rewrite. First determine whether the desired outcome
is product independence or source-code independence. If the aim is an independent
product with a maintained ArchiMate viewer/editor, keep the separately licensed
`diagram-js` engine and migrate the project-owned seams. Replacing that engine
should be a separate decision, because it would also require replacing canvas,
interaction, command/undo, event, and extension infrastructure.

| Phase | Priority | Work | Exit criteria |
| --- | --- | --- | --- |
| 0. Set the independence boundary | P0 | Choose which of the three goals above is required. Decide whether continued use of `diagram-js` and other npm dependencies is acceptable. Record the decision in an ADR. | One-sentence acceptance statement; explicit dependency and provenance policy. |
| 1. Audit provenance and rights | P0 | Compare current files with the public upstream baseline; mark inherited, changed, and project-authored code. Review fonts, icons, package dependencies, trademark use, and all required notices. The local checkout is shallow, so its current Git history is insufficient for a complete file-origin audit. | Reviewed file/asset inventory with public sources and licenses; retained notices are identified. |
| 2. Establish the new product identity | P1 | Select a distinct name and check package/repository availability. Update package metadata, executable name, public API docs, browser global, examples, CI artifact names, badges, URLs, screenshots, and documentation. Move to a new repository only if repository identity is part of the acceptance goal. | No old product identity remains in user-facing package/docs/UI except historical provenance and required notices. Existing import paths receive a planned compatibility/deprecation period if users already depend on them. |
| 3. Define a typed domain core | P1 | Create project-owned ArchiMate model types and validation boundaries. Treat dynamic XML/moddle objects as untrusted input at the parser edge; convert them into typed internal model/view DTOs. Keep relationship semantics and versioned language rules in this layer. | Type-checked model/domain package with explicit supported-language scope and contract tests. |
| 4. Replace the exchange boundary | P1 | Rework MEFF/XML parsing and writing against the typed domain core: XML preflight, IDs/references, model metadata, views/diagram data, diagnostics, import/export, and round-trip behavior. | Schema-validated synthetic fixtures and deterministic import-export-import tests; unsupported records are reported without leaking model content. |
| 5. Replace project-specific rendering and layout | P2 | Re-author ArchiMate notation rendering, text/labels, connection paths, element sizing, diagram layout, view/SVG export, and accessibility behavior. Retain or replace `diagram-js` according to Phase 0. | Stable synthetic visual regression cases in supported browsers; SVG export and view geometry contracts pass. |
| 6. Rebuild editing features if needed | P2 | Re-author editor commands and behaviors: create/move/resize, connections, undo/redo, snapping, copy/paste, replace, labels, selection, keyboard, palette, context pad, and properties UI. | Each editing action is typed, undoable where applicable, and covered by command/interaction contracts. |
| 7. Replace inherited visual assets selectively | P3 | Replace inherited icons/fonts only where needed for product identity or implementation independence. Track each replacement's source and license; keep ArchiMate trademark language descriptive and accurate. | Asset inventory and product UI are clear of assets that the independence policy disallows. |
| 8. Remove obsolete implementation | P3 | Delete superseded modules and dependencies only after their replacement passes the same public contracts. Update public API, package exports, release policy, docs, SBOM/dependency checks, and migration notes. | No production imports or package dependencies point to modules intentionally retired; clean install and release checks pass. |

### Core rewrite surface if source-code independence is required

These areas form a coupled system; rewrite them by subsystem rather than doing a
mechanical file-by-file translation:

| Subsystem | Current locations | Why it matters |
| --- | --- | --- |
| Canvas host and module composition | `lib/BaseViewer.js`, `lib/BaseModeler.js`, `lib/Viewer.js`, `lib/NavigatedViewer.js`, `lib/Modeler.js`, `lib/core/` | Owns diagram lifecycle, dependency injection, event wiring, selection, navigation, and viewer/editor composition. A complete break from `diagram-js` requires an alternate canvas/event/command foundation here. |
| ArchiMate domain and metamodel | `lib/metamodel/`, `lib/moddle/resources/archimate.json`, `src/validator/` | Defines model concepts, relationship categories, language-version rules, and the typed internal representation. The validator is already TypeScript, but it is currently a bounded subset. |
| XML and MEFF boundary | `lib/moddle/`, `lib/import/`, `lib/import/MeffModel.js`, `lib/import/MeffView.js`, `lib/import/XmlPreflight.js`, exporter utilities | Converts exchange documents to/from application state and controls malformed input, references, round-tripping, and diagnostics. This should depend on the domain core, not on canvas objects. |
| Drawing, geometry, and export | `lib/draw/`, `lib/features/modeling/ArchimateLayouter.js`, `lib/features/modeling/behavior/util/`, `lib/util/SvgExportUtil.mjs` | Implements notation, labels, connection paths, layout, and rendered SVG. It is coupled to the canvas and imported view model. |
| Editing and interaction | `lib/features/**` | Provides commands and behaviors for authoring diagrams. If the app remains read-only, this is not an early rewrite requirement; if it remains an editor, it is a major workstream. |
| Product shell, API, CLI | `index.js`, `lib/public-api.js`, `bin/`, `examples/`, package metadata | Can be renamed and reshaped before the internals are fully migrated. Keep a stable typed public API while the implementation changes behind it. |
| Bundled assets | `assets/`, `archimate-font/` | Independently inventory source and license. Replacing an asset is a branding/source goal, not a prerequisite for TypeScript. |

The exact inherited-file list must come from comparison with the public upstream
baseline, not from filenames alone. The repository's public-source-only policy
continues to apply to new code and fixtures.

## TypeScript and standalone distribution evaluation

**TypeScript does not prevent distributing a standalone HTML file.** Browsers
run JavaScript, so the build removes TypeScript types and bundles the resulting
JavaScript, CSS, fonts, and images into the chosen deliverable. TypeScript's
`noEmit` mode explicitly supports a separate bundler doing the JavaScript emit.
See the [TypeScript `noEmit` option](https://www.typescriptlang.org/tsconfig/noEmit.html)
and [Webpack's TypeScript guide](https://webpack.js.org/guides/typescript/).

This repository already has much of that pipeline:

- `src/validator/` is strict TypeScript, but root `tsconfig.json` only includes
  that directory today.
- The main viewer/editor remains JavaScript under `lib/`.
- `test/smoke/compile.mjs` uses Webpack to emit a browser UMD bundle and inline
  CSS/font/image assets.
- `examples/read-only/index.html` is currently **not** a one-file offline app:
  it loads the generated bundle and fetches a separate XML fixture. The embed
  guide requires an HTTP server because of that local fetch.

### Recommended TypeScript approach

Keep Webpack for the first migration. Adding a different bundler is unnecessary
to get TypeScript safety and would add tooling churn. Set up two explicit build
outputs:

1. A typed library bundle with the existing public API and browser UMD/ESM output.
2. An optional standalone HTML application artifact for offline/manual sharing.

Migrate the code in this order:

1. Public API, option/result types, diagnostics, and CLI contracts.
2. Domain types and model/view DTOs; isolate dynamic `moddle` values behind
   narrow adapters and runtime validation.
3. MEFF importer/exporter and geometry types.
4. Renderer, layout, commands, and editor features.
5. Remove JavaScript gradually after typed replacements and behavioral contracts
   are stable.

Use strict `tsc --noEmit` checking in CI. Per
[`ADR-0004`](../adr/0004-typescript-and-module-size.md), do not add first-party
JavaScript modules; whenever an existing first-party JavaScript application or
test module is touched, migrate that module to TypeScript in the same change.
Untouched legacy JavaScript can remain. The first migration can take longer
because an oversized touched module must also be decomposed, but the rest of the
project does not need a big-bang conversion. Keep type checking separate from
bundling so a fast transpiler cannot silently skip type errors.

### Standalone HTML options and limits

For a true one-file offline deliverable, build an HTML shell and inline the
application JS, CSS, and assets. The model can be (a) a checked-in synthetic demo
model, (b) selected by a local file picker, or (c) distributed as a second file.
For customer or user-supplied models, a local file picker is preferable to
embedding data in generated source. Test the built artifact from `file://` with
network access disabled and verify font loading, import, rendering, and export.

The current Webpack build can produce this without replacing it: add an HTML
entry/post-build embed step and ensure all dependencies are inlined (no CDN,
remote XML fetch, dynamic chunk URL, or external font file). Alternatively,
Vite builds HTML entry points and supports library output; a single-file plugin
can inline JS/CSS for offline use, though its own documentation cautions that
single-file output is not a good fit for normal hosted sites. See [Vite's build
guide](https://vite.dev/guide/build), [Vite build options](https://vite.dev/config/build-options),
and [`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile).

**Recommendation:** keep Webpack now; type the app incrementally; add a separate
single-HTML build target only when the offline distribution requirement is
confirmed. Continue to publish ordinary HTML/JS/CSS assets for normal web
hosting, where caching and smaller independent downloads are preferable.

The design-system and editor-engine recommendation is in
[`editor-and-design-system.md`](editor-and-design-system.md). It recommends
central CSS tokens and keeping `diagram-js` behind an ArchiMate adapter until a
specific requirement justifies an engine migration.

## Sources and evidence

- [`UPSTREAM.md`](../../UPSTREAM.md) and [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md): public fork baseline, MIT provenance, fonts/assets, and dependency notices.
- [`package.json`](../../package.json): package identity, current bundle dependencies, scripts, and public exports.
- [`tsconfig.json`](../../tsconfig.json), [`tsconfig.validator.json`](../../tsconfig.validator.json): strict TypeScript currently scoped to the validator.
- [`test/smoke/compile.mjs`](../../test/smoke/compile.mjs): existing Webpack UMD browser bundle and inline-asset rules.
- [`docs/rendering/read-only-html-embed.md`](../rendering/read-only-html-embed.md): current demo's separate bundle/model fetch and HTTP serving requirement.
- [TypeScript noEmit](https://www.typescriptlang.org/tsconfig/noEmit.html), [Webpack TypeScript integration](https://webpack.js.org/guides/typescript/), [Vite build guide](https://vite.dev/guide/build), [Vite build options](https://vite.dev/config/build-options), and [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile): build behavior and single-file options.
