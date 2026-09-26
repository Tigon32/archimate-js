# Research knowledge base

This directory is the repository's governed knowledge base. It is intentionally stored in Git rather than GitHub Wiki so changes are reviewable and traceable.

New external-source synopses live in the [OKF v0.2 bundle](okf/index.md). Add one concept document per source, or per tightly related source set, and record the public URL in `sources`. The existing `sources.yaml` remains the compatibility ledger used by current standards documents while its entries are migrated.

## Rules

- Every material claim needs a public source or must be marked as an inference/open question.
- Do not copy protected standard text, private project content, or customer examples.
- Prefer links plus concise interpretation.
- Record source version, retrieval date, license/redistribution constraints, and confidence.
- Keep research reusable for the generic library; do not encode private PLM or customer architecture assumptions.
- Treat source authority explicitly: The Open Group materials are authoritative for ArchiMate standards; tools, examples, and community material are implementation or learning references.
- Link and summarize external material. Do not copy protected tables, models, diagrams, schemas, or other assets without an explicit compatible licensing decision.

## Legacy YAML ledger fields

`sources.yaml` uses the following compatibility shape. New concept documents follow the OKF v0.2 frontmatter described in the bundle's [format reference](okf/open-knowledge-format.md).

```yaml
id:
title:
publisher:
url:
version:
retrieved_at:
license_or_terms:
redistribution:
source_revision:
confidence:
claims:
constraints:
review_after:
```

## Initial topics

- ArchiMate language versions and licensing constraints.
- Open Group Model Exchange File Format.
- Archi as behavioral interoperability reference.
- diagram-js extension contracts.
- Deterministic SVG rendering.
- Accessibility expectations for architecture diagrams.
- Supply-chain and release security.

## Research notes

- [diagram-js 15 core migration](diagram-js-15-core-2026-09-25.md)
- [ELK.js licensing and provenance review](elkjs-license-and-provenance.md)
- [Design Tokens 2025.10 implementation](dtcg-2025-10-implementation.md)
- [Read-only shell resize and reflow check](read-only-reflow-browser-2026-09-24.md)
- [Rendered read-only app contrast check](theme-contrast-browser-2026-09-24.md)
- [Theme accessibility results matrix for #136](theme-accessibility-matrix-2026-09-26.md)
- [Utility alignment after diagram-js 15](utility-alignment-2026-09-25.md)
