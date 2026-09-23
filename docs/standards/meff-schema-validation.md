# MEFF 3.1 Model schema CI experiment

This check probes whether GitHub-hosted CI can fetch and validate against the official
ArchiMate Model Exchange File Format (MEFF) 3.1 schema resources.

## Scope and handling

- The workflow downloads the official Model, View, and Diagram XSD files from
  [The Open Group's MEFF 3.1 resources](https://www.opengroup.org/xsd/archimate/).
- Files are stored only in the ephemeral GitHub runner's `RUNNER_TEMP` directory.
  They are not added to the repository, package, workflow artifacts, or cache.
- CI verifies the downloads against the SHA-256 digests recorded below.
- Validation uses the Model XSD against two synthetic fixtures. One is intended to
  pass; its negative counterpart deliberately omits the required model `identifier`.
- The validator is `xmllint` from Ubuntu 24.04's `libxml2-utils` package.
- This tests XML schema constraints only. It does not establish ArchiMate semantic
  validity, interoperability, certification, or complete MEFF support.

## Source and profile

- Profile: MEFF 3.1 Model XSD; the schema uses the
  `http://www.opengroup.org/xsd/archimate/3.0/` XML namespace.
- Source: [Model XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_Model.xsd),
  [View XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_View.xsd),
  [Diagram XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd).
- Retrieval date: 2026-09-23.
- SHA-256 (retrieved successfully by GitHub Actions; pinned in the workflow):

| Schema | SHA-256 |
|---|---|
| `archimate3_Model.xsd` | `dd451abe3e3193f91dd9544b279af9bbbf17e75ff1ef86f65ad52b3f8cd29794` |
| `archimate3_View.xsd` | `d708ce176403034b1229b892712cfd69660aefe17da4cc54acea1ac35e4a9854` |
| `archimate3_Diagram.xsd` | `6419080f4c4bc43b4a7b8acf870146a7bae6c3487a3ce08d3c521c028ea6056e` |

- Reuse boundary for this experiment: transient retrieval and validation by CI only;
  no redistribution, artifact upload, or caching. The schemas remain The Open Group's
  material.
- Fixture provenance: both XML fixtures are repository-authored synthetic examples,
  based on the public schema documentation; they contain no real project or customer
  data and are not copied from Open Group examples.

## Current status

The first CI run confirmed all three official XSD URLs are reachable and produced the
digests above. It then rejected the initial positive fixture because the relationship
type was incorrectly named `ServingRelationship`; the schema names it `Serving`.
That fixture was corrected. The next green CI run is required before describing it as
XSD-valid. This experiment does not claim full MEFF conformance.
