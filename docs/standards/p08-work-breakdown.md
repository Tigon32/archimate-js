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
| [#74: Import Model metadata, organizations, and properties](https://github.com/Tigon32/archimate-js/issues/74) | P2 | Preserve Model schema records outside the current core import subset. | #55, #56 |
| [#75: Preserve Diagram annotations and drill-down refs](https://github.com/Tigon32/archimate-js/issues/75) | P2 | Preserve local diagram labels, documentation, properties, and view references. | #57, #58 |
| [#76: Import additional Diagram presentation records](https://github.com/Tigon32/archimate-js/issues/76) | P2 | Preserve containers, labels, and presentation-only lines without inventing semantics. | #57, #58 |
| [#77: Preserve Viewpoint definitions and references](https://github.com/Tigon32/archimate-js/issues/77) | P2 | Preserve View schema viewpoint definitions and references. | #57, #58 |
| [#81: Refresh MEFF support documentation](https://github.com/Tigon32/archimate-js/issues/81) | P1 | Keep README, diagnostics, and P08 docs aligned with closed import work. | #54–#58 |

## Closure rule

Close each child when its acceptance criteria and tests pass. Keep #12 open until all child issues are complete, the supported subset is documented, and the project has evidence for its claims. A green parser test or a local round trip of non-schema-valid XML is not sufficient evidence of MEFF support. Do not claim certification.

## Current evidence boundary

#54, #55, #56, #57, and #58 have closed for the currently declared import
scope. `meff-schema/valid-model.xml` and `meff-schema/valid-view-diagram.xml`
are synthetic fixtures validated through the pinned MEFF 3.1 schema route. They
exercise Model-core import, supported View records, and supported Diagram
geometry/style presentation data.

This evidence does not establish full MEFF support, ArchiMate semantic validity,
tool certification, or cross-tool portability. MEFF XML export and
import/export/import equivalence remain open in #59. Model metadata,
organizations, property records, local Diagram annotations, presentation-only
Diagram records, and Viewpoint metadata are tracked separately in #74, #75, #76,
and #77. Unsupported content must keep using stable, content-free diagnostics.

[^meff-resources]: [Open Group MEFF resource directory](https://www.opengroup.org/xsd/archimate/), 3.1 Model, View, and Diagram XSDs.
[^meff-model]: [Open Group MEFF 3.1 Model schema documentation](https://www.opengroup.org/xsd/archimate/3.1/html-model/), schema version 3.1 with the `/3.0/` namespace.
