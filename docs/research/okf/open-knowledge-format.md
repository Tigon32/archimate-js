---
type: Reference
title: Open Knowledge Format specification
description: Format specification governing the repository's new external-source synopsis bundle.
resource: "https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md"
tags: [okf, knowledge, provenance, documentation]
status: stable
generated: { by: openai-codex/gpt-6, at: 2026-09-23T17:44:07Z }
stale_after: 2026-12-23T00:00:00Z
retrieved_at: 2026-09-23T17:44:07Z
authority: Normative format source for this repository's OKF bundle; unrelated to ArchiMate semantic authority.
license_or_terms: Apache-2.0 repository. This record summarizes and links the specification without copying it.
source_revision: SPEC.md blob c06e3eede0c910d0ecf12524c34204156f8795ac
sources:
  - id: okf-spec
    resource: "https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md"
    title: Open Knowledge Format specification
---

# Synopsis

OKF v0.2 defines a knowledge bundle as a directory of Markdown concept documents with YAML frontmatter.[^okf-spec] Each concept requires a non-empty `type`; provenance uses `sources`; generation, verification, lifecycle, and freshness fields are optional. A bundle-root `index.md` may declare `okf_version`.

# Use in archimate-js

Store each new external research synopsis as an OKF concept with its public source URL, retrieval time, authority boundary, and licensing constraints. Use Markdown footnotes whose labels match `sources[].id` for claim-level attribution.

# Constraints

OKF conformance describes document structure. It does not verify the truth, legal reusability, freshness, or ArchiMate conformance of a source.

[^okf-spec]: Open Knowledge Format v0.2, SPEC.md blob `c06e3eede0c910d0ecf12524c34204156f8795ac`, retrieved 2026-09-23.
