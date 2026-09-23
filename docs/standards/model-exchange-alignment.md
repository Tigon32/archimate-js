# Model Exchange alignment plan

Tracks #12.

## Version and source boundary

The package metadata currently declares ArchiMate language version 3.2. Keep
that separate from the exchange-schema version: The Open Group's public
[Model Exchange File Format resources](https://www.opengroup.org/xsd/archimate/)
describe the ArchiMate 3.1 schema set, split into Model, View, and Diagram
exchange schemas. The published model schema uses the
`http://www.opengroup.org/xsd/archimate/3.0/` namespace. These are linked
references, not copied artifacts; schema/example redistribution terms have not
been verified, so they are not bundled here.

The repository's candidate fixture is hand-authored and is **not** proven
schema-valid. Its test demonstrates the current parser's limits: model ID/name
survive, while element entries are dropped and relationship endpoints are not
resolved. This is a deterministic finding of silent loss, not evidence of
schema validity or conformance. See the test for the exact supported projection.

The Open Group announced ArchiMate 4 in April 2026 and lists it as the latest
specification on its [licensed-downloads page](https://www.opengroup.org/archimate-licensed-downloads).
That page advertises a free personal 90-day evaluation. After the user
completed the secure sign-in flow, the specification URL
[`archimate4-doc`](https://pubs.opengroup.org/architecture/archimate4-doc)
opened as an HTML specification and showed the chapter index. Further chapter
navigation timed out, so no ArchiMate 4 language requirements were used in this
MEFF assessment. The exact account and license steps were not fully reviewed.
No ArchiMate 4 exchange schema was identified in the public MEFF resource page.
Accordingly, this record covers the currently published MEFF 3.1 resource set
and does not infer ArchiMate 4 exchange compatibility.

## Goal

Make ArchiMate Model Exchange File Format import/export behavior measurable and deterministic, so report diagrams can remain portable across tools.

## Current fixture evidence

The Open Group's public MEFF overview identifies the format as an exchange mechanism and describes separate model, view, and diagram exchange schemas; it also cautions that the format is not intended as persistent model storage. The existing `minimal-application-view.xml` is an implementation-focused synthetic fixture, not a verified MEFF conformance sample. `meff-core-candidate.xml` is an independently hand-authored synthetic probe for the model/name/elements core plus a relationship. Neither fixture has been validated against the official XSD. The current parser/serializer contract observes model ID/name round-tripping; it also exposes that candidate element entries are not mapped and relationship endpoints are not resolved (the relationship remains generic). This is evidence of a gap, not a schema-validity, certification, or cross-tool portability claim.

Source: [`opengroup-archimate-meff`](../research/sources.yaml), The Open Group's public [MEFF overview and FAQ](https://www.opengroup.org/open-group-archimate-model-exchange-file-format). The official standard is referenced there via its publications catalog; official schemas and examples are not copied into this repository.

## Alignment dimensions

| Dimension | Import expectation | Export expectation | Evidence status |
|---|---|---|---|
| Model identity | Preserve stable model IDs when present. | Emit stable IDs. | Planned. |
| Elements | Preserve IDs, type, name, documentation where supported. | Emit supported concept fields deterministically. | Planned. |
| Relationships | Preserve IDs, type, source, target, and specialization fields where supported. | Emit relationships using the shared validation matrix. | Planned. |
| Views | Preserve view IDs, names, child nodes, connections, and bounds where supported. | Emit selected supported view data deterministically. | Planned. |
| Styling | Preserve style fields where supported; warn for unsupported fields. | Emit only supported styling fields. | Planned. |
| Properties | Preserve supported properties and warn on unsupported fields. | Emit supported properties deterministically. | Planned. |
| Diagnostics | Report unsupported or lossy fields. | Report unsupported export omissions. | Planned. |

## Deterministic evidence record

Each exchange-format finding should use this shape:

| Field | Meaning |
|---|---|
| `exchange_feature` | Model, element, relationship, view, style, property, or diagnostics feature. |
| `direction` | `import`, `export`, or `round_trip`. |
| `expected_behavior` | What the library should do. |
| `actual_behavior` | Observed behavior from this fork. |
| `lossiness` | `none`, `warned`, `silent`, or `unknown`. |
| `fixture_id` | Synthetic/public fixture proving the finding. |
| `evidence_source_id` | Public source ID from `docs/research/sources.yaml`. |
| `test_id` | Automated test or manual oracle reference. |

## Implementation sequence

1. Add a smallest synthetic exchange fixture with one model, one view, one element pair, and one relationship.
2. Add import preservation checks for IDs and view membership.
3. Add export or round-trip checks only after current serialization behavior is characterized.
4. Convert silent loss into deterministic warnings before claiming round-trip support.
5. Compare against Archi or other public tools only with license/provenance notes.

## Acceptance gates

- Import preserves supported IDs, concepts, relationships, views, labels, and style data.
- Unsupported fields produce deterministic diagnostics.
- Round-trip diffs are explainable and test-linked.
- No test fixture uses private architecture data.

## Current disposition

P08 remains open. The repository now records the exchange-schema version and
artifact provenance boundary, but still lacks a permitted schema-validation
oracle, faithful element/relationship/view import, stable warnings for lossy
fields, and semantic export/re-import coverage. Do not close P08 or claim
interoperability until those gates have evidence.
