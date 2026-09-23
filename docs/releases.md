# Public API and release policy

## Supported package entry points

Consumers should import only the package root or the validator subpath:

```js
import Viewer, { mountViewer, renderViewToSvg } from 'archimate-js';
import { validateArchimateXml, ARCHIMATE_LANGUAGE_VERSION } from 'archimate-js/validator';
```

The root exports the default `Viewer`, `mountViewer(options)`, and
`renderViewToSvg(options)`. Use a browser-oriented bundler to consume the root
entry; its source uses extensionless module specifiers and is not a direct
Node.js runtime entry. The validator subpath exports its TypeScript
validator API. `package.json` `exports` is the authoritative list; source paths
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

The read-only GitHub Actions workflow `Release gate` runs on a manual dispatch
or a `v*` tag. It does not publish packages, request credentials, or use
repository secrets. A tag must match `package.json` exactly (`v` plus the
package version); a mismatch fails the gate. It runs lint, the full test suite,
compile checks, the browser render smoke test, and the packed-package consumer
test. The suite includes SVG stability/render assertions, third-party notice
and package-content checks, synthetic-fixture scans, and safe logger tests.

The gate is release evidence, not a release declaration. Do not label a version
an operational release until the workflow passes for its tag and the release
record has links to importer, exporter, and rendered-SVG evidence from
synthetic/public fixtures plus Archi import/export comparison. Keep claims
limited to what those checks establish. At this revision the latter
interoperability evidence has not been completed, so `1.0.0` is not cleared.

The workflow installs dependencies with lifecycle scripts disabled and
`npm test` performs the package build/test locally without publishing or
contacting a registry. The repository currently has no lockfile; until one is
committed, dependency installation is not a reproducible `npm ci` operation.
This is a release-readiness limitation and must be resolved before claiming a
reproducible operational release.

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

The packed consumer test compiles the validator, packs the actual project
archive with lifecycle scripts disabled, extracts it into a temporary
consumer, bundles the root API as a browser consumer, imports the validator
subpath in Node, and checks blocked deep imports. It uses the already-installed
dependency tree and does not install from a registry.
