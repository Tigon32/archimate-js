# Public API and release policy

## Supported package entry points

Consumers should import only the package root or the documented subpaths:

```js
import Viewer, { mountViewer, renderViewToSvg } from 'archimate-js';
import { validateArchimateXml, ARCHIMATE_LANGUAGE_VERSION } from 'archimate-js/validator';
import { importMeffToModelDto, exportModelDtoToMeff, serializeModelDto, parseModelDto } from 'archimate-js/model-dto';
import { layoutView } from 'archimate-js/layout';
import { createExportService } from 'archimate-js/export';
import 'archimate-js/app-shell.css'; // Optional app control styles for a CSS-capable bundler.
```

The `app-shell.css` subpath supplies scoped `.am-app` control styles and the
locally packaged IBM Plex font; the host adds `.am-app` to its control root.
It does not style diagram notation. See [app shell states](roadmap/app-shell-styles.md).
The root exports the default `Viewer`, `mountViewer(options)`, and
`renderViewToSvg(options)`. Use a browser-oriented bundler to consume the root
entry; its source uses extensionless module specifiers and is not a direct
Node.js runtime entry. The validator subpath exports its TypeScript
validator API. The opt-in `model-dto` subpath imports MEFF XML to the supported
project-owned DTO subset, validates DTO inputs, and serializes/parses DTO JSON.
`exportModelDtoToMeff(dto)` emits MEFF only for the representable subset of
semantic element nodes and relationship connections. It rejects diagnostics,
unknown DTO fields, unsupported presentation records, incompatible geometry or
colors, and any output that cannot be reimported to an equivalent DTO.
It applies the existing XML preflight limits and returns diagnostics for detected
omitted exchange data. The JSON round trip is deterministic for the supported
DTO subset; it is not a lossless MEFF round trip for arbitrary exchange files.
Review
`diagnostics` before using a projection; see the [DTO boundary scope](roadmap/model-dto-boundary.md).
The opt-in `layout` subpath accepts a validated DTO model and selected view id;
it computes a detached view and reversible geometry patch for explicit full
built-in layout. See [layout facade scope](layout/diagram-optimization.md).
The Node-only `export` subpath accepts bounded XML and one selected view and
exports SVG, PNG, or PDF through an existing local Chrome/Chromium. Configure
trusted runtime values such as `chrome` and `outputDirectory` with
`createExportService`; they are not accepted as untrusted per-request paths.
The service blocks network access, supports cancellation, returns safe coded
diagnostics, and publishes files atomically when configured with an output
root. Browser consumers continue to use `renderViewToSvg` for SVG.
`package.json` `exports` is the authoritative list; source paths
such as `archimate-js/lib/...`, `archimate-js/src/...`, and internal dependency
paths are unsupported and intentionally blocked. There is no promise to keep
internal file paths stable. No internal import path is deprecated because none
is a supported package API. Existing consumers of those paths should migrate
to a documented root or validator export; request a new public export before
depending on an internal module.

The standalone viewer API requires a browser DOM. `renderViewToSvg` returns an
SVG string and also requires a browser DOM for layout. The validator runs in
Node or a browser and does not render diagrams. The package does not claim full
ArchiMate or Model Exchange File Format conformance; see the [validator
profile](standards/validator-profile.md) and [supported semantics
profile](standards/supported-semantics-profile.md).

## Version channels

All published versions use Semantic Versioning. The current `0.0.x` line is
experimental: APIs, behavior, and package layout may change between patch
versions while the public boundary is being established. A prerelease such as
`0.1.0-rc.1` is for explicit evaluation; it must identify known gaps and must
not be described as operationally supported. Stable `1.x` begins only after
the operational gate below passes and importer/exporter/render evidence is
recorded. There is currently no operational release or automated publishing
workflow.

Before `1.0.0`, breaking public API changes may be made in a minor or patch
version while the version remains `0.y.z`; the changelog must call out any such
change under **Breaking**. For prereleases, follow SemVer ordering and do not
overwrite or reuse a published version. Use patch for compatible fixes, minor
for compatible additions, and major for incompatible changes once stable.

## Operational release gate

The GitHub Actions workflow `Release gate` runs on a manual dispatch or a `v*`
tag. Its readiness job is read-only and uses no repository secrets. A separate
attestation job runs only after a successful tag readiness job; only that job
can request an OIDC token and write an attestation. Neither job publishes a
package. A tag must match `package.json` exactly (`v` plus the
package version); a mismatch fails the gate. It runs the maintained lint profile
for the importer, release scripts, and related tests, the full test suite,
compile checks, the browser render smoke test, and the packed-package consumer
test. The lint profile uses the repository's correctness rules while leaving
legacy formatting untouched; repository-wide formatting cleanup remains
separate. The suite includes SVG stability/render assertions, third-party
notice and package-content checks, synthetic-fixture scans, and safe logger
tests.

The gate is release evidence, not a release declaration. Do not label a version
an operational release until the workflow passes for its tag and the release
record has links to importer, exporter, and rendered-SVG evidence from
synthetic/public fixtures plus Archi import/export comparison. Keep claims
limited to what those checks establish. At this revision the latter
interoperability evidence has not been completed, so `1.0.0` is not cleared.

The workflow installs dependencies with lifecycle scripts disabled and uses the
committed lockfile through `npm ci --ignore-scripts`. It does not publish the
package. The packed-consumer check may use the configured npm registry to
resolve the archive's declared runtime dependencies.

After all checks pass, the gate packs the compiled npm artifact and installs that
exact tarball in an isolated production consumer with lifecycle scripts disabled.
It generates an SPDX JSON SBOM from the committed lockfile's production graph.
This is the package's resolved dependency inventory, not a file-level inventory
of the tarball: npm's tree-based SBOM currently rejects this package's local
`file:./archimate-font` dependency when the tarball is installed outside the
repository. The
`release-evidence` workflow artifact contains the tarball, `sbom.spdx.json`,
`manifest.json`, and `SHA256SUMS`. The manifest records the source SHA, workflow
run, Node/npm versions, package and lockfile hashes, and successful check names.
Download and verify the artifact locally with `sha256sum -c SHA256SUMS`; compare
the source SHA and workflow run in the manifest with the release tag. This
checksum file detects corruption after download but does not authenticate the
build. On a successful `v*` tag run, the separate attestation job downloads
the same run's evidence, checks every checksum, identifies the single tarball,
and requests a GitHub build-provenance attestation for that tarball only. It has
`contents: read`, `id-token: write`, and `attestations: write` permissions;
manual dispatches skip this job and remain read-only. Verify a downloaded
tarball from a completed tag run with:

```sh
gh attestation verify path/to/archimate-js-*.tgz -R Tigon32/archimate-js
```

For a consumer check, download and unpack the `release-evidence` artifact from
the completed tag run. Get the tag, its full 40-character source commit SHA,
and the Actions run ID from GitHub, then run:

```sh
node scripts/verify-release-evidence.mts path/to/release-evidence v0.0.4 FULL_SOURCE_SHA RUN_ID
```

Replace the example tag and placeholders with the reviewed run's values. The
command checks the tarball, SBOM, and manifest against `SHA256SUMS`; checks the
manifest's package version, source SHA, and run URL against those expected
values; then uses `gh attestation verify` to require this repository's release
workflow, tag ref, and source commit. It requires GitHub CLI access to fetch
the attestation and fails if that verification is unavailable. The expected
values must come from the trusted release record, not the downloaded manifest.
The attestation covers the tarball only; the downloaded SBOM and manifest are
checksum-checked for consistency but are not independently authenticated by
that tarball attestation.

The attestation workflow is wired but issuance remains unverified until a
reviewed tag run produces an attestation and the downloaded tarball passes this
command. An attestation binds a digest to a workflow identity; it does not
establish ArchiMate conformance or operational release readiness.

## Local release checks

Use Node.js 22.12 or newer. Install dependencies with lifecycle scripts
disabled, then run:

```sh
npm install --ignore-scripts
npm run release:check
```

The browser check needs a local Chrome/Chromium binary:

```sh
CHROME_BIN="$(command -v google-chrome || command -v chromium || command -v chromium-browser)" npm run release:check
```

The packed consumer test compiles the validator, model DTO, layout, and browser artifact, packs the
actual project archive, and installs that archive into an isolated temporary
consumer with lifecycle scripts disabled. It invokes the installed CLI, bundles
the root API as a browser consumer, imports the validator, model DTO and layout subpaths in Node, and
checks blocked deep imports. npm may contact the configured registry to resolve
the archive's declared runtime dependencies; the test never publishes.
