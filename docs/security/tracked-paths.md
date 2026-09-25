# Tracked-path provenance gate

`npm run test:tracked-paths` checks Git-tracked paths during the ordinary
read-only CI test job. It uses NUL-separated `git ls-files` output, so spaces
and newlines in filenames cannot hide an entry. The check never reads model or
media file content. Symlinks in controlled paths cannot use an exception.
Failures print only rule IDs and counts; the offending path, exception path,
rationale, and file bytes stay out of CI logs.

The gate rejects reserved directory components for private sources, catalogs,
browser profiles, sessions, and dumps; obvious session/prompt/customer-export
dump filenames; fixture files absent from the fixture manifest; unindexed
research artifacts; and ArchiMate/XML models or raster images, PDFs, and ZIP
files without a `PUBLIC` or `SYNTHETIC` entry in
[`test/fixtures/manifest.json`](../../test/fixtures/manifest.json). Research
notes at the directory root are indexed in its README; OKF documents are
indexed by `okf/index.md`. The existing font assets and source SVGs are
outside this narrow model/media rule. The fixture scanner and content-hash
check continue to validate the inventory itself, including its provenance and
reviewed hash.

To add a legitimate fixture, place it under `test/fixtures/`, add a reviewed
manifest entry with a content hash and provenance, and run
`npm run test:fixtures && npm run test:provenance && npm run test:tracked-paths`.
For a narrow, reviewed exception to an unmanifested model/media or research
finding, add one exact repository-relative path and its exact finding class to
[`public-source-exceptions.json`](public-source-exceptions.json). The policy
requires a non-empty rationale, approver login, review date, and future expiry.
The validator rejects duplicate, expired, malformed, broad, or unused records;
a record only changes its matching finding to a reviewed outcome. It cannot
override a forbidden-directory finding, authorize a symlink or fixture without
its manifest entry, or change any unrelated rule. Review the source and
redistribution basis independently: a valid exception is governance metadata,
not proof of legality or of a GitHub approval event. Remove the record and any
index exception when the finding is fixed, or renew it through a reviewed PR
before expiry. Governance-file review enforcement remains tracked in #264.

Release evidence records only the active exception count, authorized finding
classes, and earliest expiry. It omits exception paths and rationale. This
summary helps consumers see that an exception policy was in force without
disclosing its private review notes or target paths.

This deterministic check catches only the stated path patterns. It does not
establish that source is public or legally redistributable, inspect arbitrary
file content for secrets, or replace human provenance review. See
[ADR-0001](../adr/0001-public-clean-room-boundary.md) and [#109](https://github.com/Tigon32/archimate-js/issues/109).
