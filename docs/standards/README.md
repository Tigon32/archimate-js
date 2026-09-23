# Standards validation workspace

This directory contains public-source-only planning material for ArchiMate semantic validation and Model Exchange File Format alignment.

The files here are deliberately deterministic: they define the records, evidence fields, and acceptance gates that future implementation PRs should update as public information improves.

## Source boundary

- The Open Group ArchiMate specification and official exchange-format artifacts are the normative sources.
- Public tools such as Archi are interoperability references, not normative replacements.
- Do not copy protected standard text into this repository.
- Do not use private PLM, Confluence, customer, or real architecture models as examples.
- Use synthetic fixtures unless public redistribution rights are explicit and recorded.

## Update flow

1. Record or update public source metadata in `docs/research/sources.yaml`.
2. Update the relevant standards workspace record.
3. Add synthetic fixtures or tests that exercise the recorded rule.
4. Link implementation PRs back to the relevant issue and evidence row.
