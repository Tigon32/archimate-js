# Fixture and research provenance check (Phase 1)

`npm run test:provenance` (`scripts/check-provenance.mjs`) is a deterministic,
structural check over the repository's two existing non-code inventories:

- `test/fixtures/manifest.json`, the fixture inventory already enforced by
  `test/security/scan-fixtures.mjs` (`npm run test:fixtures`);
- `docs/research/sources.yaml` and the `docs/research/okf/*.md` concept
  bundle, the research citation inventories described in
  [`docs/research/README.md`](../research/README.md).

This is Phase 1 of [issue #109](https://github.com/Tigon32/archimate-js/issues/109):
narrow, structural validation for the two inventories that already exist. It
does not implement the issue's later scope (CODEOWNERS, secrets scanning,
SBOMs, attestations, or broad heuristic content scanning); those remain open
follow-up work.

## What it checks

Fixtures (reusing the existing manifest and its existing validation in
`scanFixtureTree`, not a duplicate copy of that logic):

- every manifest entry resolves to a path inside `test/fixtures/`, exists,
  and is not a duplicate id/path;
- `classification` is `PUBLIC` or `SYNTHETIC` only;
- required fields (`purpose`, `provenance`, `expected_coverage`,
  `contains_private_data: false`, `review_after`, and the additional
  `PUBLIC`-only fields) are present;
- every fixture file appears in the manifest.

Added in this phase, on top of the existing manifest checks:

- every entry requires a lowercase, 64-character `content_sha256` digest of
  its fixture file's bytes. Missing (`content-hash-missing`), malformed
  (`content-hash-invalid`), and mismatched (`content-hash-mismatch`) values
  fail the local provenance check. Findings do not print fixture contents.

After an intentional fixture edit, review its classification and provenance,
then calculate its new digest with `sha256sum test/fixtures/path/to/file` (or
`shasum -a 256 test/fixtures/path/to/file` on macOS). Copy the lowercase
64-character hex digest into that entry's `content_sha256` field in
`test/fixtures/manifest.json`, and run `npm run test:provenance`. Hash the
checked-in bytes directly, including any line endings; do not normalize the
file before hashing.

Research (`docs/research/sources.yaml`, a flat citation ledger):

- required fields per entry (`id`, `title`, `url`, `license_or_terms`,
  `retrieved_at`, `review_after`);
- duplicate `id` detection within the file;
- `url` must parse as `http:` or `https:` (an allowlisted-scheme check, not a
  domain allowlist).

Research (`docs/research/okf/*.md`, the OKF concept bundle):

- required frontmatter fields per concept document (`type`, `title`,
  `description`, `resource`, `retrieved_at`, `authority`,
  `license_or_terms`);
- `resource` and every `sources[].resource` must be an `http:`/`https:` URL;
- every `sources[]` entry needs a non-empty `id`, and ids must be unique
  within a single document (the same citation `id` is expected to repeat
  *across* different documents, e.g. a shared Open Group FAQ reference);
- `docs/research/okf/index.md` must link every concept document, and must
  not link a file that does not exist.

## Wiring

`test:provenance` runs as part of `npm test` immediately after
`test:fixtures`, so it runs in CI without any workflow changes.

## Limitations and scope

- **This is not proof of license or public legitimacy.** The digest confirms
  byte integrity against the manifest value, not source legality or whether
  the manifest value was independently verified. No automated check
  can confirm that a URL, a claim, or a fixture is actually public, correctly
  licensed, or free of restricted content. It only confirms that the
  inventories are internally consistent, structurally complete, and reference
  reachable-looking (`http`/`https`) locations. Human provenance review
  (ADR-0001, `AGENTS.md`, PR review) remains required.
- It does not scan file *content* for secrets or private markers; that is
  `test/security/scan-fixtures.mjs`'s existing, separate responsibility, and
  this phase intentionally does not duplicate or extend that heuristic scan.
- It does not validate that a URL is reachable, unchanged, or still hosts the
  cited content; it only checks the URL's scheme and shape.
- The YAML/frontmatter reader is a small, purpose-built parser for the exact
  block shapes used by `sources.yaml` and the OKF frontmatter (scalars,
  quoted scalars, flow arrays/objects, and block sequences). It is not a
  general YAML implementation; an unsupported shape fails as unreadable
  rather than being silently misparsed, and needs a parser update or a
  documented ADR-level exception rather than a workaround.
- Research artifacts are not hash-pinned by this fixture-only check.

## False positives and exceptions

Findings are structural (missing/duplicate/mismatched field, disallowed URL
scheme, index/file drift). If a check produces a false positive on
legitimately new content:

1. Fix the inventory entry when the finding reflects a real gap (this is the
   expected outcome for almost all findings).
2. If the check itself is wrong for a documented reason (for example, a
   genuinely new required scheme), open a PR that changes
   `scripts/check-provenance.mjs` with the reason recorded in the PR
   description and, for a consequential rule change, an ADR update. Do not
   work around a finding by weakening the manifest data itself without
   review.
3. There is no manifest-level "exception" flag in this phase (unlike
   `scripts/source-policy-exceptions.json` for the size/TypeScript policy);
   scoped exception handling for provenance findings is deferred to a later
   phase of issue #109.

Findings for the fixture inventory omit file paths and any matched content
(consistent with `scan-fixtures.mjs`'s existing redaction, since that scan
also matches against fixture content). Findings for the research inventories
include the file name, since Phase 1 only inspects frontmatter/YAML
structure and does not echo any external content.
