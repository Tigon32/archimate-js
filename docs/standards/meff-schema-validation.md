# MEFF 3.1 Model schema validation

This CI check fetches and validates against The Open Group's official ArchiMate
Model Exchange File Format (MEFF) 3.1 schema resources.

## Scope and handling

- The workflow downloads the official Model, View, and Diagram XSD files from
  [The Open Group's MEFF 3.1 resources](https://www.opengroup.org/xsd/archimate/).
- Files are stored only in the ephemeral GitHub runner's `RUNNER_TEMP` directory.
  They are not added to the repository, package, workflow artifacts, or cache.
- CI verifies the downloads against the SHA-256 digests recorded below.
- The synthetic positive fixture passes the Model XSD. The negative fixture fails
  because it deliberately omits the required model `identifier`.
- The validator is `xmllint` from Ubuntu 24.04's `libxml2-utils` package.
- This verifies XML schema constraints only. It does not establish ArchiMate semantic
  validity, interoperability, certification, or complete MEFF support.

## Source and profile

- Profile: MEFF 3.1 Model XSD; the schema uses the
  `http://www.opengroup.org/xsd/archimate/3.0/` XML namespace.
- Source: [Model XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_Model.xsd),
  [View XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_View.xsd),
  [Diagram XSD](https://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd).
- Retrieval date: 2026-09-23.
- SHA-256, verified by GitHub Actions and pinned in the workflow:

| Schema | SHA-256 |
|---|---|
| `archimate3_Model.xsd` | `dd451abe3e3193f91dd9544b279af9bbbf17e75ff1ef86f65ad52b3f8cd29794` |
| `archimate3_View.xsd` | `d708ce176403034b1229b892712cfd69660aefe17da4cc54acea1ac35e4a9854` |
| `archimate3_Diagram.xsd` | `6419080f4c4bc43b4a7b8acf870146a7bae6c3487a3ce08d3c521c028ea6056e` |

- Reuse boundary for this check: transient retrieval and validation by CI only; no
  redistribution, artifact upload, or caching. The schemas remain The Open Group's
  material.
- Fixture provenance: both XML fixtures are repository-authored synthetic examples,
  based on public schema documentation. They contain no real project or customer
  data and are not copied from Open Group examples.

## Verification evidence

- [MEFF XSD validation workflow run 35933526410](https://github.com/Tigon32/archimate-js/actions/runs/35933526410):
  schema download and checksum verification succeeded; the positive Model fixture
  validated, and the negative fixture failed for the expected missing identifier.
- [Main CI workflow run 35933526444](https://github.com/Tigon32/archimate-js/actions/runs/35933526444):
  Node.js 22, Node.js 24, and browser smoke jobs passed.
- Both runs were triggered for PR head `f19857ff1b278d6b8a585d5cb3fff1e5c71b61fb`.

These results establish schema validity for the positive fixture under the MEFF 3.1
Model XSD only. They make no claim of full MEFF conformance.
