# MEFF 3.1 Model schema CI experiment

This check probes whether GitHub-hosted CI can fetch and validate against the official
ArchiMate Model Exchange File Format (MEFF) 3.1 schema resources.

## Scope and handling

- The workflow downloads the official Model, View, and Diagram XSD files from
  [The Open Group's MEFF 3.1 resources](https://www.opengroup.org/xsd/archimate/).
- Files are stored only in the ephemeral GitHub runner's `RUNNER_TEMP` directory.
  They are not added to the repository, package, workflow artifacts, or cache.
- The workflow records SHA-256 digests in its job summary, but does not archive the
  schemas. Once reachable, these digests will be pinned in the workflow before this
  experiment can become a reproducible gate.
- Validation uses the Model XSD against two synthetic fixtures. One is intended to
  pass; its negative counterpart deliberately omits the required model `identifier`.
- This tests XML schema constraints only. It does not establish ArchiMate semantic
  validity, interoperability, certification, or complete MEFF support.

## Source and profile

- Profile: MEFF 3.1 Model XSD; the schema uses the
  `http://www.opengroup.org/xsd/archimate/3.0/` XML namespace.
- Source: [Model XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_Model.xsd),
  [View XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_View.xsd),
  [Diagram XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd).
- Retrieval date: 2026-09-23.
- Reuse boundary for this experiment: transient retrieval and validation by CI only;
  no redistribution or caching. The schemas remain The Open Group's material.
- Fixture provenance: both XML fixtures are repository-authored synthetic examples,
  based on the public schema documentation; they contain no real project or customer
  data and are not copied from Open Group examples.

## Current status

This is an access and validation experiment, not a completed conformance claim.
A green run plus pinned schema digests is required before describing the positive
fixture as XSD-valid. If the public endpoint cannot be reached by the runner or its
terms do not allow transient CI use, remove this workflow and keep the fixtures
labelled as unvalidated parser probes.
