---
type: Reference
title: The Open Group ArchiMate Model Exchange File Format FAQ
description: Official FAQ describing MEFF purpose, schema layers, and exchange scope.
resource: "https://www.opengroup.org/open-group-archimate-model-exchange-file-format"
tags: [archimate, meff, exchange-format, faq, open-group]
status: stable
generated: { by: openai-codex/gpt-6, at: 2026-09-23T23:00:47Z }
retrieved_at: 2026-09-23T23:00:47Z
authority: Official Open Group guidance for the purpose and implementation context of MEFF.
license_or_terms: Public FAQ; summarize and link only. The associated standard and example artifacts have separate terms.
sources:
  - id: opengroup-meff-faq
    resource: "https://www.opengroup.org/open-group-archimate-model-exchange-file-format"
    title: ArchiMate Model Exchange File Format FAQ
    publisher: The Open Group
  - id: opengroup-meff-resources
    resource: "https://www.opengroup.org/xsd/archimate/"
    title: ArchiMate Model Exchange File Format resources
    publisher: The Open Group
  - id: opengroup-certification
    resource: "https://www.opengroup.org/certifications/archimate/tool"
    title: ArchiMate Tool Certification
    publisher: The Open Group
---

# Synopsis

The FAQ describes MEFF as tool-to-tool exchange for ArchiMate 3.x and distinguishes the **Model**, **View**, and **Diagram** schemas. The format carries exchangeable model content and presentation data; it is not a tool's native persistence format. Its requirements should be implemented against the selected MEFF schema, not inferred from a tool's private `.archimate` format.[^opengroup-meff-faq]

The official resource directory exposes 3.1 XSDs and generated documentation for those three schema layers, plus example models, interoperability snippets, and the FAQ.[^opengroup-meff-resources] The FAQ says the standard applies to ArchiMate 3.1 and 3.2; that does not make every public XSD resource a 3.2-specific schema.

# Use in archimate-js

Use the FAQ to keep product scope and test design focused on exchange between tools. Split model semantics, view membership, and diagram geometry into separate implementation and verification steps. Treat native-file features, visual presentation, and semantic legality as distinct evidence questions.

# Constraints

The FAQ is not a validator and cannot establish that a locally authored XML file is schema-valid. The public directory links official artifacts, but link availability does not grant redistribution rights. Certification requires its own process and evidence; successful parsing or a passing XSD check is not certification.[^opengroup-certification]

[^opengroup-meff-faq]: [The Open Group ArchiMate Model Exchange File Format FAQ](https://www.opengroup.org/open-group-archimate-model-exchange-file-format), version 1.10 (October 2022), retrieved 2026-09-23.
[^opengroup-meff-resources]: [MEFF resource directory](https://www.opengroup.org/xsd/archimate/), retrieved 2026-09-23.
[^opengroup-certification]: [ArchiMate Tool Certification](https://www.opengroup.org/certifications/archimate/tool), retrieved 2026-09-23.
