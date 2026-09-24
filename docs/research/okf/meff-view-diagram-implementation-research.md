---
type: Reference
title: MEFF View and Diagram geometry implementation research
description: Schema-backed summary of MEFF 3.1 presentation fields and GitHub implementations reviewed for issue #58.
resource: "https://www.opengroup.org/xsd/archimate/3.1/html-diagram/"
tags: [archimate, meff, diagram, geometry, waypoints, styles, interoperability]
status: stable
retrieved_at: 2026-09-24T05:30:22Z
authority: The Open Group schemas define format constraints; tool implementations are non-normative behavioral references.
license_or_terms: This document summarizes and links sources only. No third-party source code or Open Group schema text is copied. Review source licenses before reuse.
sources:
  - id: opengroup-meff-resources
    resource: "https://www.opengroup.org/xsd/archimate/"
    title: ArchiMate Model Exchange File Format resources
    publisher: The Open Group
  - id: opengroup-meff-faq
    resource: "https://www.opengroup.org/open-group-archimate-model-exchange-file-format"
    title: ArchiMate Model Exchange File Format FAQ
    publisher: The Open Group
  - id: opengroup-meff-diagram-doc
    resource: "https://www.opengroup.org/xsd/archimate/3.1/html-diagram/"
    title: Schema documentation for archimate3_Diagram.xsd
    publisher: The Open Group
  - id: archi-exchange-repo
    resource: "https://github.com/archimatetool/OpenGroupXMLExchange"
    title: Archi Open Group XML Exchange plug-in (archived; integrated into Archi)
    publisher: Archi project
  - id: archi-exchange-importer
    resource: "https://github.com/archimatetool/archi/blob/master/org.opengroup.archimate.xmlexchange/src/org/opengroup/archimate/xmlexchange/XMLModelImporter.java"
    title: Archi MEFF XML model importer
    publisher: Archi project
  - id: archi-exchange-exporter
    resource: "https://github.com/archimatetool/archi/blob/master/org.opengroup.archimate.xmlexchange/src/org/opengroup/archimate/xmlexchange/XMLModelExporter.java"
    title: Archi MEFF XML model exporter
    publisher: Archi project
  - id: archi-current-exchange-module
    resource: "https://github.com/archimatetool/archi/tree/master/org.opengroup.archimate.xmlexchange"
    title: Current Archi Open Group XML Exchange module
    publisher: Archi project
  - id: qan-ameff-converter
    resource: "https://github.com/qan-ai/ameff-archimate4-converter"
    title: AMEFF ArchiMate 3.x to 4 converter
    publisher: qan-ai
  - id: qan-xml-dom
    resource: "https://github.com/qan-ai/ameff-archimate4-converter/blob/main/src/main/java/nl/archimate4/converter/Xml.java"
    title: In-place DOM handling for AMEFF
    publisher: qan-ai
  - id: qan-style-values
    resource: "https://github.com/qan-ai/ameff-archimate4-converter/blob/main/src/main/java/nl/archimate4/converter/StyleValues.java"
    title: AMEFF style-value checks and normalization
    publisher: qan-ai
---

# Synopsis

The Open Group publishes separate MEFF 3.1 Model, View, and Diagram schemas, generated documentation, examples, and interoperability snippets. Its FAQ describes MEFF as a tool-to-tool exchange format for ArchiMate 3.x; schema version and ArchiMate language version should be recorded separately.[^opengroup-meff-resources][^opengroup-meff-faq]

The Diagram schema describes node positions from the diagram's top-left origin: x/y are required non-negative integers; w/h are required positive integers. The annotations define direction and origin but do not define a physical unit for these coordinates. Treat them as diagram-space coordinates, not assumed CSS pixels. Nested nodes still carry positions measured from the diagram origin; an importer whose internal child coordinates are parent-relative needs an explicit conversion.[^opengroup-meff-diagram-doc]

A sourced connection has required source/target ID references. Its child sequence allows one source attachment, zero or more bendpoints, and one target attachment, in that order. Each point has x/y coordinates. A relationship connection also references a semantic relationship. Keep endpoint attachments distinct from intermediate bendpoints; collapsing them into one list can lose authored connection geometry.[^opengroup-meff-diagram-doc]

Node and connection styles may contain line color, fill color, and font; line width is an optional positive integer. The schema describes RGB channels as 0–255, optional alpha as 0–100, line width as a pixel thickness, and font size in points with half-point increments. Font style values can be combined. A connection's label/documentation/properties can inherit from its referenced ArchiMate relationship or override/add to them locally.[^opengroup-meff-diagram-doc]

# GitHub implementation review

## Archi Open Group XML Exchange

The standalone [OpenGroupXMLExchange repository is archived and read-only](https://github.com/archimatetool/OpenGroupXMLExchange); its README says the code was integrated into the main Archi application. The current module is in [archimatetool/archi](https://github.com/archimatetool/archi/tree/master/org.opengroup.archimate.xmlexchange).[^archi-exchange-repo][^archi-current-exchange-module] Its importer provides the closest direct precedent for #58:

- It reads diagram bounds and converts nested node coordinates into Archi's parent-relative internal model.
- It resolves view connections after collecting nodes, then maps MEFF bendpoints into Archi's endpoint-relative connection representation.
- Its exporter restores diagram-space coordinates and shifts negative layouts into a non-negative diagram extent; it also maps node/connection styles.[^archi-exchange-importer][^archi-exchange-exporter]

This is useful for identifying conversion steps and building fixtures, not as the format authority. It does not XSD-validate on import, skips connection-to-connection bendpoints, adapts attachment data to Archi's own model, and clamps line widths to Archi's supported range. These are target-tool choices or limitations, not MEFF requirements.[^archi-exchange-importer][^archi-exchange-exporter]

## AMEFF ArchiMate 4 converter

The [QAN converter](https://github.com/qan-ai/ameff-archimate4-converter) reads and modifies XML in place. Its DOM approach is intended to leave untouched views, bounds, styles, bendpoints, and vendor extensions intact, avoiding losses caused by converting the whole document through a narrower internal model.[^qan-ameff-converter][^qan-xml-dom]

It is a migration utility, not a MEFF importer: it changes model types and relationships for ArchiMate 4. It also optionally normalizes invalid style values; for example, its own line-width policy caps values at 100 even though the MEFF XSD allows any positive integer. Keep that repair policy out of #58 unless a separate, explicit normalization rule is adopted.[^qan-ameff-converter][^qan-style-values]

# Use in archimate-js

- Use the pinned MEFF 3.1 XSDs and their documentation as the contract; compare every peer-tool behavior against them.
- Preserve x/y/w/h as diagram-space integers with their coordinate unit recorded as unspecified by the schema. Convert nested positions only at a documented boundary and test reversibility.
- Preserve source/target attachments separately from ordered bendpoints.
- Map styles field by field, including alpha and font units. Do not clamp valid positive line widths to another tool's limits.
- Use peer projects to discover edge cases and expected interoperability behaviors; do not copy their code or infer conformance from their output.
- Keep schema validation, ArchiMate semantic validation, rendering fidelity, and cross-tool interoperability as separate evidence claims.

# Limits

This review establishes the schema field shape and relevant implementation patterns, but it does not prove all real-world exporter conventions. The physical unit for diagram x/y/w/h is not stated in the schema annotations. Test the supported mapping with schema-valid synthetic fixtures and, where permitted, a public tool-produced MEFF sample. The Open Group resource page provides examples and interoperability snippets; use them with their source and redistribution boundaries recorded.[^opengroup-meff-resources]

[^opengroup-meff-resources]: [The Open Group MEFF resources](https://www.opengroup.org/xsd/archimate/), accessed 2026-09-24.
[^opengroup-meff-faq]: [The Open Group MEFF FAQ](https://www.opengroup.org/open-group-archimate-model-exchange-file-format), version 1.10, accessed 2026-09-24.
[^opengroup-meff-diagram-doc]: [MEFF 3.1 Diagram schema documentation](https://www.opengroup.org/xsd/archimate/3.1/html-diagram/), accessed 2026-09-24; compare with the pinned hashes in [the repository schema-validation record](../../standards/meff-schema-validation.md).
[^archi-exchange-repo]: [Archi Open Group XML Exchange plug-in](https://github.com/archimatetool/OpenGroupXMLExchange), README states that the archived plug-in was integrated into Archi.
[^archi-current-exchange-module]: [Current Archi XML Exchange module](https://github.com/archimatetool/archi/tree/master/org.opengroup.archimate.xmlexchange), including the MEFF 3.1 XSDs and current importer/exporter.
[^archi-exchange-importer]: [XMLModelImporter.java](https://github.com/archimatetool/archi/blob/master/org.opengroup.archimate.xmlexchange/src/org/opengroup/archimate/xmlexchange/XMLModelImporter.java), current source reviewed 2026-09-24.
[^archi-exchange-exporter]: [XMLModelExporter.java](https://github.com/archimatetool/archi/blob/master/org.opengroup.archimate.xmlexchange/src/org/opengroup/archimate/xmlexchange/XMLModelExporter.java), current source reviewed 2026-09-24.
[^qan-ameff-converter]: [QAN AMEFF converter](https://github.com/qan-ai/ameff-archimate4-converter), README and test guidance reviewed 2026-09-24. README identifies the project as MIT licensed.
[^qan-xml-dom]: [Xml.java](https://github.com/qan-ai/ameff-archimate4-converter/blob/main/src/main/java/nl/archimate4/converter/Xml.java), reviewed 2026-09-24.
[^qan-style-values]: [StyleValues.java](https://github.com/qan-ai/ameff-archimate4-converter/blob/main/src/main/java/nl/archimate4/converter/StyleValues.java), reviewed 2026-09-24.
