# Supported-semantics profile (implementation inventory)

**Profile revision:** 0.2

**Implementation baseline:** ArchiMate 3.2 conservative decision set

**Status:** implemented subset; not a conformance claim.

This profile records what this repository currently expresses in code and where the evidence stops. It is intended to make later #11 work incremental and auditable. It is not a normative relationship matrix, a complete language definition, or a substitute for The Open Group specification.

## Standards and evidence boundary

The Open Group identifies the ArchiMate Specification as its standard. Its public [ArchiMate overview](https://www.opengroup.org/archimate-forum/archimate-overview) and [ArchiMate 3.2 Specification Reference Cards](https://www.opengroup.org/sites/default/files/docs/downloads/n221p.pdf) are useful public orientation sources. The reference cards are not treated here as a complete machine-readable rule oracle. The Open Group's [Model Exchange File Format page](https://www.opengroup.org/open-group-archimate-model-exchange-file-format) identifies MEFF as a standard format for model exchange; that does not establish this library's import/export conformance.

The repository's source ledger records the overview, exchange-format page, and reference cards as `opengroup-archimate-overview`, `opengroup-archimate-meff`, and `opengroup-archimate-3.2-reference-cards` in [docs/research/sources.yaml](../research/sources.yaml). No protected specification tables are reproduced here. No rule below is inferred from another tool's behavior.

## Observed implementation

The following are code facts at the assessment snapshot, not claims about completeness or normative correctness.

| Area | What the code currently expresses | What this does **not** establish |
|---|---|---|
| Metamodel namespace | The Moddle descriptor is named `archimate3_model` and declares `http://www.opengroup.org/xsd/archimate/3.0/`. It defines model, element, relationship, view, and reference properties. The package metadata separately declares the conservative ArchiMate 3.2 semantics profile. ([descriptor](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/moddle/resources/archimate.json)) | A namespace string and profile declaration do not prove complete implementation or conformance. |
| Element/relationship vocabulary | `Concept.js` exports a fixed set of element and relationship names, including concept families, eleven named relationship types, and AND/OR Junction display names. `src/language/concept-registry.mts` inventories the current element constants with legacy aliases and renderer keys; its generated renderer projection is drift-checked. ([vocabulary](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/metamodel/Concept.js)) | The constants and inventory do not demonstrate exhaustive coverage, version alignment, viewpoint support, profile semantics, or specialization semantics. |
| Relationship candidate maps | Per-source-type maps in `*RelationshipMap.js` associate target-type keys with compact relationship-code strings. `ModelUtil.getRelationshipMap` selects a map; [`RelationshipUtil`](../../lib/util/RelationshipUtil.mts) adapts codes `s,c,g,i,r,v,a,n,t,f,o` to named relationship types. ([map selection](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/util/ModelUtil.js)) | The maps remain the fallback for endpoint pairs with no reviewed registry row. They have no version/evidence metadata and are not a supported-semantics matrix. |
| Predicate and editor rules | [`RelationshipUtil`](../../lib/util/RelationshipUtil.mts) consults the [reviewed 3.2 registry](../../src/language/relationship-decisions.mts) for covered endpoint pairs: create/replacement choices contain only rows marked allowed, and the reconnect predicate accepts only an allowed row. Pairs with no reviewed rows keep the existing legacy map behavior. The initial node-to-node gesture still creates a generic relationship shell; node/connection cases remain separate. | This is a bounded editor affordance, not whole-model validation. Imported relationships are preserved independently, and uncovered pairs do not gain a standards claim. |
| Junctions and relationship endpoints | Relationship types, including junction display types, are present in the modeler's relationship element map. The code-token translation table above has no token for a junction. The connection rule has explicit node/connection association cases, but no visible connection-to-connection branch. ([relationship map](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/util/ModelUtil.js), [editor rule](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/features/rules/ArchimateRules.js)) | This mixed representation does not prove junction or relationship-to-relationship semantic support. These cases require explicit synthetic tests and a normative evidence row before a support claim. |
| Exchange and viewpoint/profile scope | The Moddle descriptor can represent source/target references and view structures. | Representation alone does not establish semantic validation during import/export, round-trip fidelity, viewpoint constraints, profile restrictions, or handling of specializations. These remain unverified. |

The matrix in [relationship-validation-matrix.md](relationship-validation-matrix.md) now records the implemented evidence boundary. The standalone validator exports a pure tri-state relationship service with a small application-layer decision set. Missing rows are unsupported rather than implicitly invalid.

The built-in `archimate/unsupported-relationship` lint rule consumes that same service and reports disallowed rows and combinations not covered by the reviewed profile. Its findings describe this repository's ArchiMate 3.2 profile only; they are not a universal relationship matrix or a conformance determination.

## Advisory and adversarial review

- **Advisory standards lens:** keep the normative authority with The Open Group, version every future evidence row, and separate source-backed rules from implementation observations. Public reference cards can orient investigation but are insufficient by themselves to claim complete rule coverage.
- **Adversarial interoperability/privacy lens:** the opaque code strings are difficult to audit and have no local provenance; UI acceptance can be mistaken for import validity; table drift can create plausible but incompatible diagrams. Future fixtures must be synthetic and public. Do not add private/customer models, payloads, or copied protected tables as evidence.

## Conservative status and next gates

The repository declares ArchiMate 3.2 in package metadata and validator exports. The service has automated synthetic tests for allowed, disallowed reverse-direction, unknown, alternate-version, junction, and relationship-endpoint cases. The exact coverage of legacy editor maps remains unknown. No ArchiMate conformance or Model Exchange conformance claim is made.

Future rows should remain traceable to permitted public Open Group evidence and receive focused synthetic tests. Junction, relationship-to-relationship, viewpoint, profile, and specialization semantics remain explicit unsupported scope. Preserve legacy maps as implementation behavior until each decision is independently reviewed.
