---
type: Reference
title: The Open Group MEFF 3.1 Model schema documentation
description: Generated official documentation for the ArchiMate 3.1 model-exchange XML schema.
resource: "https://www.opengroup.org/xsd/archimate/3.1/html-model/"
tags: [archimate, meff, xsd, model-schema, interoperability]
status: stable
generated: { by: openai-codex/gpt-6, at: 2026-09-23T23:00:47Z }
retrieved_at: 2026-09-23T23:00:47Z
authority: Official generated documentation for The Open Group's MEFF 3.1 Model XSD.
license_or_terms: Public schema documentation; summarize and link only. Schema redistribution terms have not been reviewed.
sources:
  - id: opengroup-meff-model-xsd-doc
    resource: "https://www.opengroup.org/xsd/archimate/3.1/html-model/"
    title: Schema documentation for archimate3_Model.xsd
    publisher: The Open Group
  - id: opengroup-meff-resources
    resource: "https://www.opengroup.org/xsd/archimate/"
    title: ArchiMate Model Exchange File Format resources
    publisher: The Open Group
---

# Synopsis

The generated documentation identifies the schema version as 3.1 while retaining the namespace `http://www.opengroup.org/xsd/archimate/3.0/`. The root `model` requires an `identifier` typed as an XML ID and at least one `name`; `elements` and `relationships` are separate child collections. Relationship `source` and `target` attributes are required XML ID references.[^opengroup-meff-model-xsd-doc]

This makes the distinction between XML spelling and the repository's current parser fixture material: using `id` and accepting an `id`/name round-trip does not prove conformance to the Model XSD's `identifier` and name requirements. The model schema also permits optional metadata, properties, organizations, and property definitions; optionality at schema level does not imply support by every tool.[^opengroup-meff-resources]

# Use in archimate-js

Build a minimal schema-valid model fixture before broadening semantic tests. Then test IDs and references as IDs, and keep XSD structural validation separate from ArchiMate relationship legality. Use the exact schema version in test metadata.

# Constraints

The generated documentation describes the XSD structure; it does not establish the full semantic meaning of every language relationship or presentation rule. Do not copy the official XSD or examples into this repository until their redistribution terms are confirmed.

[^opengroup-meff-model-xsd-doc]: [MEFF 3.1 Model schema documentation](https://www.opengroup.org/xsd/archimate/3.1/html-model/), retrieved 2026-09-23. Direct automated fetch returned HTTP 403; the public indexed documentation supplied the summarized schema facts.
[^opengroup-meff-resources]: [MEFF resource directory](https://www.opengroup.org/xsd/archimate/), retrieved 2026-09-23.
