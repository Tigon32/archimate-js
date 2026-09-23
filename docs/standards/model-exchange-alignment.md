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

The repository's candidate fixture is hand-authored and is **not** proven
schema-valid. The Model XSD requires a root `identifier` and relationship
endpoints expressed as ID references; this candidate instead uses `id`, and
its element records are not reconstructed by the importer. Its model ID/name
round-trip test is therefore only a parser-level probe, not MEFF support
evidence. The public import path now emits stable
`MEFF_ELEMENTS_UNSUPPORTED` and `MEFF_RELATIONSHIPS_UNSUPPORTED` warnings for
these lower-case exchange records. See the [Model schema synopsis](../research/okf/opengroup-meff-model-schema.md)
for source links and the fixture test for the exact current behavior.

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

The Open Group describes MEFF as tool-to-tool exchange rather than persistent model storage and publishes separate Model, View, and Diagram schemas. The generated 3.1 Model documentation requires `model/@identifier` and one or more names; relationship endpoints are required ID references. The existing `minimal-application-view.xml` is an implementation-focused synthetic fixture, not a verified MEFF sample. `meff-core-candidate.xml` is an independently authored parser probe, not an XSD-valid fixture. Its local `id`/name round-trip result cannot be counted as MEFF model-identity support. The importer test observes element loss, unresolved relationship endpoints, and stable warnings. None of this establishes schema validity, certification, or cross-tool portability.

Source: [`opengroup-archimate-meff`](../research/sources.yaml), The Open Group's public [MEFF overview and FAQ](https://www.opengroup.org/open-group-archimate-model-exchange-file-format). The official standard is referenced there via its publications catalog; official schemas and examples are not copied into this repository.

## Alignment dimensions

| Dimension | Import expectation | Export expectation | Evidence status |
|---|---|---|---|
| Model identity | Preserve schema `identifier` and names. | Emit stable schema IDs and names. | Candidate only probes local `id`/name parser behavior; MEFF identity unverified. |
| Elements | Preserve IDs, type, name, documentation where supported. | Emit supported concept fields deterministically. | Candidate element records are not reconstructed; stable unsupported warning is tested. |
| Relationships | Preserve IDs, type, source, target, and specialization fields where supported. | Emit relationships using the shared validation matrix. | Candidate records remain generic with unresolved endpoints; stable unsupported warning is tested. |
| Views | Preserve view IDs, names, child nodes, connections, and bounds where supported. | Emit selected supported view data deterministically. | A separate implementation fixture parses, but MEFF view exchange is unverified. |
| Styling | Preserve style fields where supported; warn for unsupported fields. | Emit only supported styling fields. | Planned. |
| Properties | Preserve supported properties and warn on unsupported fields. | Emit supported properties deterministically. | Planned. |
| Diagnostics | Report unsupported or lossy fields. | Report unsupported export omissions. | Stable import warnings tested for candidate elements and relationships; export omission reporting remains planned. |

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

P08 remains open. The repository records the exchange-schema version and
artifact provenance boundary and reports current candidate gaps with stable
warnings. The candidate is not XSD-valid, so its local `id`/name round-trip is
not evidence of MEFF identity support. The project still lacks an authorized
schema-validation oracle, faithful model/view/diagram import, export omission
reporting, and supported-subset semantic round-trip coverage. Do not close P08
or claim interoperability until those gates have evidence.
