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

## Review rule

If a fixture cannot be explained from public standards terminology and synthetic names alone, it does not belong here.
