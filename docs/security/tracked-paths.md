# Tracked-path provenance gate

`npm run test:tracked-paths` checks Git-tracked paths during the ordinary
read-only CI test job. It uses NUL-separated `git ls-files` output, so spaces
and newlines in filenames cannot hide an entry. The check never reads model or
media file content and does not follow symlinks. Failures print only rule IDs
and counts; the offending path and bytes stay out of CI logs.

The gate rejects reserved directory components for private sources, catalogs,
browser profiles, sessions, and dumps; obvious session/prompt/customer-export
dump filenames; and ArchiMate/XML models or raster images, PDFs, and ZIP files
without a `PUBLIC` or `SYNTHETIC` entry in
[`test/fixtures/manifest.json`](../../test/fixtures/manifest.json). The
existing font assets and source SVGs are outside this narrow model/media
rule. The fixture scanner and content-hash check continue to validate the
inventory itself, including its provenance and reviewed hash.

To add a legitimate fixture, place it under `test/fixtures/`, add a reviewed
manifest entry with a content hash and provenance, and run
`npm run test:fixtures && npm run test:provenance && npm run test:tracked-paths`.
There is no automatic exception list for paths outside that inventory. A
legitimate new media class needs a reviewed policy change with a source and
license basis; never rename a prohibited file to evade the gate.

This deterministic check catches only the stated path patterns. It does not
establish that source is public or legally redistributable, inspect arbitrary
file content for secrets, or replace human provenance review. See
[ADR-0001](../adr/0001-public-clean-room-boundary.md) and [#109](https://github.com/Tigon32/archimate-js/issues/109).
