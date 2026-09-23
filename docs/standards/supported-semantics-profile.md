# Supported-semantics profile (implementation inventory)

**Profile revision:** 0.1  
**Assessment snapshot:** `Tigon32/archimate-js` main at `a40756ae90494b2e378d70ddc5e453c1a1ebbe37`  
**Status:** descriptive inventory only; not a conformance claim.

This profile records what this repository currently expresses in code and where the evidence stops. It is intended to make later #11 work incremental and auditable. It is not a normative relationship matrix, a complete language definition, or a substitute for The Open Group specification.

## Standards and evidence boundary

The Open Group identifies the ArchiMate Specification as its standard. Its public [ArchiMate overview](https://www.opengroup.org/archimate-forum/archimate-overview) and [ArchiMate 3.2 Specification Reference Cards](https://www.opengroup.org/sites/default/files/docs/downloads/n221p.pdf) are useful public orientation sources. The reference cards are not treated here as a complete machine-readable rule oracle. The Open Group's [Model Exchange File Format page](https://www.opengroup.org/open-group-archimate-model-exchange-file-format) identifies MEFF as a standard format for model exchange; that does not establish this library's import/export conformance.

The repository's source ledger records the overview and exchange-format pages as `opengroup-archimate-overview` and `opengroup-archimate-meff` in [docs/research/sources.yaml](../research/sources.yaml). No protected specification tables are reproduced here. No rule below is inferred from another tool's behavior.

## Observed implementation

The following are code facts at the assessment snapshot, not claims about completeness or normative correctness.

| Area | What the code currently expresses | What this does **not** establish |
|---|---|---|
| Metamodel namespace | The Moddle descriptor is named `archimate3_model` and declares `http://www.opengroup.org/xsd/archimate/3.0/`. It defines model, element, relationship, view, and reference properties. ([descriptor](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/moddle/resources/archimate.json)) | A namespace string is not a declaration of supported ArchiMate language version or proof that a release implements that version. `package.json` does not currently declare an ArchiMate version. |
| Element/relationship vocabulary | `Concept.js` exports a fixed set of element and relationship names, including concept families, eleven named relationship types, and AND/OR Junction display names. ([vocabulary](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/metamodel/Concept.js)) | The constants do not demonstrate exhaustive coverage, version alignment, viewpoint support, profile semantics, or specialization semantics. |
| Relationship candidate maps | Per-source-type maps in `*RelationshipMap.js` associate target-type keys with compact relationship-code strings. `ModelUtil.getRelationshipMap` selects a map; `RelationshipUtil` translates the codes `s,c,g,i,r,v,a,n,t,f,o` to named relationship types. ([map selection](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/util/ModelUtil.js), [code translation](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/util/RelationshipUtil.js)) | These tables have no version/evidence metadata and have not been checked row-by-row against a normative source in this profile. They are implementation data, not yet a supported-semantics matrix. |
| Predicate and editor rules | `isRelationshipAllowed(sourceType, targetType, relationshipType)` reads a source map and returns whether its code string contains that relationship. `ArchimateRules.canConnect` uses it on reconnect of node-to-node relationships; initial node-to-node connection creation returns a generic relationship type, while node/connection cases are handled separately. ([predicate](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/util/RelationshipUtil.js), [editor rule](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/features/rules/ArchimateRules.js)) | This is not evidence of one pure validator shared by editing, import, export, or report generation. UI affordances and editing rules must not be described as whole-model semantic validation. |
| Junctions and relationship endpoints | Relationship types, including junction display types, are present in the modeler's relationship element map. The code-token translation table above has no token for a junction. The connection rule has explicit node/connection association cases, but no visible connection-to-connection branch. ([relationship map](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/util/ModelUtil.js), [editor rule](https://github.com/Tigon32/archimate-js/blob/a40756ae90494b2e378d70ddc5e453c1a1ebbe37/lib/features/rules/ArchimateRules.js)) | This mixed representation does not prove junction or relationship-to-relationship semantic support. These cases require explicit synthetic tests and a normative evidence row before a support claim. |
| Exchange and viewpoint/profile scope | The Moddle descriptor can represent source/target references and view structures. | Representation alone does not establish semantic validation during import/export, round-trip fidelity, viewpoint constraints, profile restrictions, or handling of specializations. These remain unverified. |

The planned matrix in [relationship-validation-matrix.md](relationship-validation-matrix.md) remains the future acceptance record; this profile does not populate normative `allowed=true/false` rows.

## Advisory and adversarial review

- **Advisory standards lens:** keep the normative authority with The Open Group, version every future evidence row, and separate source-backed rules from implementation observations. Public reference cards can orient investigation but are insufficient by themselves to claim complete rule coverage.
- **Adversarial interoperability/privacy lens:** the opaque code strings are difficult to audit and have no local provenance; UI acceptance can be mistaken for import validity; table drift can create plausible but incompatible diagrams. Future fixtures must be synthetic and public. Do not add private/customer models, payloads, or copied protected tables as evidence.

## Conservative status and next gates

At this snapshot, the repository declares no ArchiMate version and has no demonstrated complete relationship validation service. Relationship maps are present and are used by editor behavior; exact standards coverage is **unknown**. No ArchiMate conformance or Model Exchange conformance claim is made.

Before adding normative allow/deny outcomes, the project should (1) decide and document the intended language-version scope from authoritative Open Group material, (2) create a testable source/evidence record with no copied protected tables, (3) characterize current behavior with synthetic tests for valid, invalid, reverse-direction, unknown-type, junction, and relationship-to-relationship cases, and (4) distinguish editor-only support from import/export validation. Until then, preserve the maps as implementation behavior, not as an authority.
