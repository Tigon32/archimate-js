---
type: Reference
title: The Open Group ArchiMate exchange-format resources
description: Official resource directory for ArchiMate Model Exchange File Format schemas, documentation, examples, snippets, and FAQs.
resource: "http://www.opengroup.org/xsd/archimate/"
tags: [archimate, exchange-format, xsd, interoperability, open-group]
status: stable
generated: { by: openai-codex/gpt-6, at: 2026-09-23T23:01:51Z }
stale_after: 2026-12-23T00:00:00Z
retrieved_at: 2026-09-23T23:01:51Z
authority: Official Open Group support material for the ArchiMate Model Exchange File Format.
license_or_terms: The site states The Open Group copyright. Availability for download does not establish permission to redistribute schemas, examples, or documentation in this MIT repository.
sources:
  - id: opengroup-exchange-resources
    resource: "http://www.opengroup.org/xsd/archimate/"
    title: ArchiMate Model Exchange File Format resources
    last_modified: 2019-11-15T00:00:00Z
  - id: opengroup-meff-faq
    resource: "https://www.opengroup.org/open-group-archimate-model-exchange-file-format"
    title: ArchiMate Model Exchange File Format FAQ
  - id: opengroup-meff-model-xsd
    resource: "https://www.opengroup.org/xsd/archimate/3.1/html-model/"
    title: Schema documentation for archimate3_Model.xsd
---

# Synopsis

The official directory links separate ArchiMate 3.1 XSDs and generated documentation for **Model**, **View**, and **Diagram** exchange, along with example models, interoperability snippets, and an FAQ.[^opengroup-exchange-resources] The FAQ separately describes MEFF as applicable to ArchiMate 3.1 and 3.2. The available 3.1 XSDs retain the `/3.0/` XML namespace; schema version and namespace are distinct facts.[^opengroup-meff-faq]

The generated Model schema documentation requires a model `identifier` (XML ID) and at least one name. Relationship `source` and `target` attributes are required XML ID references.[^opengroup-meff-model-xsd] This explains why parsing and round-tripping a hand-authored file with `id` attributes does not prove MEFF model-schema validity.

# Use in archimate-js

Treat these artifacts as primary references for schema validation and import/export testing. Pin the exact artifact version, test Model/View/Diagram behavior separately, and verify terms before adding schemas or examples. See the [FAQ synopsis](opengroup-meff-faq.md), [Model schema synopsis](opengroup-meff-model-schema.md), and [certification boundary](opengroup-archimate-certification.md).

# Constraints

Do not equate successful XML parsing with schema or ArchiMate conformance. Do not vendor official files until an explicit licensing decision permits it.

[^opengroup-exchange-resources]: [The Open Group exchange-format resource directory](https://www.opengroup.org/xsd/archimate/), retrieved 2026-09-23; automated retrieval returned HTTP 403, so this synopsis relies on its indexed public page and linked official resources.
[^opengroup-meff-faq]: [The Open Group MEFF FAQ](https://www.opengroup.org/open-group-archimate-model-exchange-file-format), retrieved 2026-09-23.
[^opengroup-meff-model-xsd]: [MEFF 3.1 Model schema documentation](https://www.opengroup.org/xsd/archimate/3.1/html-model/), retrieved 2026-09-23.
