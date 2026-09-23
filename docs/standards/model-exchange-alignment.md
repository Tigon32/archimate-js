# Model Exchange alignment plan

Tracks #12.

See the [P08 child-issue breakdown](p08-work-breakdown.md) for the prioritized, independently closable work packages.

## Version and source boundary

The package metadata currently declares ArchiMate language version 3.2. Keep
that separate from the exchange-schema version: The Open Group's public
[Model Exchange File Format resources](https://www.opengroup.org/xsd/archimate/)
describe the ArchiMate 3.1 schema set, split into Model, View, and Diagram
exchange schemas. The published model schema uses the
`http://www.opengroup.org/xsd/archimate/3.0/` namespace. These are linked
references, not copied artifacts; schema/example redistribution terms have not
been verified, so they are not bundled here.

The repository now contains a synthetic MEFF 3.1 Model fixture validated by the
pinned CI schema check. The importer recognizes the official Model namespace and
schema `identifier` attributes. It maps them to internal `id` fields, retains
exact `xsi:type` QNames for Model elements and relationships, preserves names
(including language tags) and documentation, and resolves relationship
`source`/`target` IDREFs to the same canonical element objects exposed through
the model ID indexes. This is a bounded Model-core subset. Unknown Model
element/relationship fields and unresolved IDREFs use fixed content-free
diagnostics. The importer does not perform XSD validation or ArchiMate semantic
relationship validation; the schema CI and semantic validator are separate
checks. Views, diagrams, properties, organizations, and extensions remain
separate or unsupported work. See the
[MEFF Model schema synopsis](../research/okf/opengroup-meff-model-schema.md)
and #55 tests for the exact exercised subset. There is no MEFF XML exporter yet;
export omission diagnostics belong with #59.

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

The Open Group describes MEFF as tool-to-tool exchange rather than persistent model storage and publishes separate Model, View, and Diagram schemas. The generated 3.1 Model documentation requires `model/@identifier` and one or more names; relationship endpoints are required ID references. `meff-schema/valid-model.xml` passes the pinned Model XSD validation job and its import contract preserves model and record identifiers, exact concrete type QNames, localized names, and linked relationship endpoints. Repeated import produces the same supported-field projection and diagnostics. The implementation candidate in `synthetic/meff-core-candidate.xml` remains a parser probe, not a schema-valid fixture. No export omission can yet be measured because the package does not implement MEFF XML export. These results do not establish semantic validity, certification, or cross-tool portability.

Source: [`opengroup-archimate-meff`](../research/sources.yaml), The Open Group's public [MEFF overview and FAQ](https://www.opengroup.org/open-group-archimate-model-exchange-file-format). The official standard is referenced there via its publications catalog; official schemas and examples are not copied into this repository.

## Alignment dimensions

| Dimension | Import expectation | Export expectation | Evidence status |
|---|---|---|---|
| Model identity | Preserve schema `identifier` and localized names. | Emit stable schema IDs and names. | Imported from the schema-valid Model fixture; repeated-import projection is tested. |
| Elements | Preserve IDs, concrete `xsi:type`, localized name, and documentation. | Emit supported concept fields deterministically. | Core ID/type/name mapping and canonical ID index are tested; unsupported fields receive fixed warnings. |
| Relationships | Preserve IDs, concrete `xsi:type`, localized name, and resolved source/target ID references. | Emit relationships using the shared validation matrix. | Core ID/type mapping and identity-linked endpoints are tested; no semantic relationship validation is implied. |
| Views | Preserve view IDs, names, child nodes, connections, and bounds where supported. | Emit selected supported view data deterministically. | A separate implementation fixture parses, but MEFF view exchange is unverified. |
| Styling | Preserve style fields where supported; warn for unsupported fields. | Emit only supported styling fields. | Planned. |
| Properties | Preserve supported properties and warn on unsupported fields. | Emit supported properties deterministically. | Planned. |
| Diagnostics | Report unsupported or lossy fields. | Report unsupported export omissions. | Stable import warnings cover recognized model, view, diagram, and extension categories; export omission reporting awaits a MEFF exporter. |

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

1. Pin an authorized MEFF schema-validation route and author a minimal schema-valid Model fixture with identifier, names, elements, a relationship, and valid references.
2. Implement and test Model import preservation for identifiers, concepts, names, and relationship endpoints.
3. Extend stable diagnostics to every unsupported Model field and export omission.
4. Implement View import independently from Diagram geometry, following the separate published schemas.
5. Add deterministic supported-subset export and semantic import/export/import comparisons.
6. Compare with public tools or certification fixtures only with source, access, and license evidence.

## Acceptance gates

- Import preserves supported IDs, concepts, relationships, views, labels, and style data.
- Unsupported fields produce deterministic diagnostics.
- Round-trip diffs are explainable and test-linked.
- No test fixture uses private architecture data.

## Current disposition

P08 remains open. Model-core import is now exercised against the synthetic fixture that passes the pinned MEFF 3.1 Model XSD job. View/Diagram import, export omission reporting, and supported-subset export round-trip remain open. XSD validation and identifier/reference mapping do not establish ArchiMate semantic validity, certification, or cross-tool interoperability.
