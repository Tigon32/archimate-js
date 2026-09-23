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

`synthetic/meff-core-candidate.xml` is an independently authored parser probe based on public MEFF overviews, not a schema-valid MEFF fixture. The Model XSD requires a root `identifier`; this candidate uses `id`. Its local model ID/name round-trip therefore does not prove MEFF identity support. The public import path reports unmapped element records and generic relationships with unresolved endpoints through stable warnings. It is not copied from an official example and does not establish conformance or interoperability.


The `meff-schema/valid-model.xml` and `meff-schema/invalid-missing-model-identifier.xml` fixtures are synthetic positive/negative candidates for the official MEFF 3.1 Model XSD. The positive fixture also tests Model-core import: schema identifiers, concrete type QNames, localized names, and resolved relationship endpoints. Their validation workflow fetches the published XSD set into ephemeral runner storage, verifies pinned digests, and never commits, caches, or uploads schema files. The positive fixture is evidence of XSD validity only after the workflow passes; neither fixture proves ArchiMate semantic validity or tool certification.


`meff-schema/valid-view-diagram.xml` is a synthetic MEFF 3.1 Model+View+Diagram fixture. CI validates the combined document against the official Diagram XSD fetched transiently to runner storage. It contains a named Diagram, nested Element nodes, and a Relationship connection linked to the fixture's Model records. The fixture is schema-structure evidence; parser tests establish only the explicitly supported mapping and do not claim complete MEFF support.
