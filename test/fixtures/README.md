# Test fixtures

Fixtures in this directory must be safe for a public repository.

## Allowed sources

- `SYNTHETIC`: hand-authored examples created for this repository.
- `PUBLIC`: public examples with redistribution permission recorded in the manifest.

## Prohibited sources

- customer, PLM, Confluence, Jira, Slack, email, or private GitHub material;
- real architecture exports, screenshots, names, hostnames, IP addresses, costs, controls, or environment details;
- generated examples that encode private project knowledge.

## Required manifest fields

Every fixture must appear in `manifest.json` with:

- `id`
- `path`
- `classification`
- `purpose`
- `provenance`
- `contains_private_data`
- `expected_coverage`
- `review_after`

For `PUBLIC` fixtures, also record `source`, `license`, `retrieved_on`, and `allowed_use`.

## Automated safety gate

`npm test` scans all files under this directory and validates the manifest. The scan checks common email, private host/IP, credential-shaped value, symlink, binary, and manifest hazards. It intentionally reports rule identifiers and sorted file numbers rather than paths or matched text, so CI logs cannot expose a value that caused a finding.

Projects with sensitive vocabulary can supply `ARCHIMATE_FIXTURE_BLOCK_TERMS` as a comma- or newline-separated environment variable for local checks. Terms are matched case-insensitively as whole words/phrases and are never printed. Do not commit organization-specific terms to this public repository or expose them to CI running untrusted pull requests.

## Exchange-format fixture status

`synthetic/minimal-application-view.xml` is a parser/render fixture authored for this implementation; its current test only establishes that the fork can parse its root. It has not been validated against The Open Group MEFF schema and should not be cited as a conformant exchange file.

`synthetic/meff-core-candidate.xml` is a second, independently hand-authored synthetic fixture shaped around the public MEFF overview's model/name/elements core, with a relationship added to probe this parser's current support. It is not copied from an official example and is also not XSD-validated. The contract test currently observes model ID/name round-tripping, but also records that element entries are not mapped and the relationship is imported only as a generic relationship with no resolved endpoints. It does not establish MEFF conformance or interoperability.
