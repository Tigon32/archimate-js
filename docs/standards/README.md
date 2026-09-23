# Standards validation workspace

The Open Group ArchiMate specification and published exchange/conformance
artifacts are normative references for language and interchange behavior.
Behavior observed in Archi or another product is an interoperability reference,
not a substitute for the standard. See [how to report a suspected gap](../rendering/read-only-html-embed.md#reporting-suspected-standards-gaps).

The current implementation and limits are documented in the [validator
profile](validator-profile.md), [relationship matrix](relationship-validation-matrix.md),
and [Model Exchange alignment record](model-exchange-alignment.md). The project
does not claim ArchiMate or MEFF conformance.

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
