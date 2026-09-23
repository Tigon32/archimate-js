# P08 work breakdown

P08 remains the umbrella for ArchiMate Model Exchange File Format compatibility. The work is split by independently verifiable capability, reflecting The Open Group's separate **Model**, **View**, and **Diagram** schemas and keeping XML schema validation separate from ArchiMate semantic validation.[^meff-resources][^meff-model]

## Child work items

| Issue | Priority | Scope | Dependency |
|---|---:|---|---|
| [#54: Pin schema profile and build valid fixtures](https://github.com/Tigon32/archimate-js/issues/54) | P1 | Select an authorized schema-validation route, pin version/provenance, and add valid/invalid synthetic fixtures. | None |
| [#55: Import Model core](https://github.com/Tigon32/archimate-js/issues/55) | P1 | Preserve schema identity, element types/names, and relationship IDs/references. | #54 |
| [#56: Complete stable loss diagnostics](https://github.com/Tigon32/archimate-js/issues/56) | P1 | Report unsupported import data and export omissions using stable, content-free codes. | Can proceed in parallel; initial codes are in PR #53. |
| [#57: Import View records](https://github.com/Tigon32/archimate-js/issues/57) | P2 | Preserve view identifiers, names, membership, and semantic references. | #54, #55 |
| [#58: Import Diagram presentation](https://github.com/Tigon32/archimate-js/issues/58) | P2 | Preserve supported geometry, waypoints, and styles as presentation data. | #57 |
| [#59: Export and round-trip the supported subset](https://github.com/Tigon32/archimate-js/issues/59) | P2 | Emit deterministic schema-valid XML and demonstrate semantic import/export/import equivalence. | #55–#58 |

## Closure rule

Close each child when its acceptance criteria and tests pass. Keep #12 open until all child issues are complete, the supported subset is documented, and the project has evidence for its claims. A green parser test or a local round trip of non-schema-valid XML is not sufficient evidence of MEFF support. Do not claim certification.

## Current evidence boundary

The current `meff-core-candidate.xml` is synthetic and not XSD-validated. The Model schema documentation requires root `identifier` and relationship source/target ID references, while the candidate uses `id`; its model identity round trip is therefore parser-only evidence. PR #53 adds stable warnings for the element and relationship records the importer does not reconstruct. Full Model, View, Diagram, and export support remain unverified.[^meff-model]

[^meff-resources]: [Open Group MEFF resource directory](https://www.opengroup.org/xsd/archimate/), 3.1 Model, View, and Diagram XSDs.
[^meff-model]: [Open Group MEFF 3.1 Model schema documentation](https://www.opengroup.org/xsd/archimate/3.1/html-model/), schema version 3.1 with the `/3.0/` namespace.
