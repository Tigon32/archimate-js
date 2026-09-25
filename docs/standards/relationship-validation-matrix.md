# Relationship validation matrix

Tracks #11 and #64.

## Supported profile

The public service targets **ArchiMate 3.2**. The version is declared as
`archimateLanguageVersion` in `package.json` and exported as
`ARCHIMATE_LANGUAGE_VERSION` and `RELATIONSHIP_SEMANTICS_VERSION` from
`archimate-js/validator`.

`validateRelationshipSemantics(input)` is a pure tri-state service. It returns
`allowed`, `disallowed`, or `unsupported` and performs no I/O or mutation. The
versioned rows are exported as `RELATIONSHIP_SEMANTIC_ROWS` so they can be
reviewed without inspecting editor behavior.

The reviewed rows are authored once in `src/language/relationship-decisions.mts`.
The pure service lives beside those rows in `src/language/relationship-semantics.mts`.
The validator's public API re-exports it, and the DTO editor command boundary
uses it for new relationship edits. This registry is the repository's reviewed
3.2 subset, not a complete standards matrix; legacy canvas affordance maps
remain outside its evidence boundary.

## Evidence boundary

The Open Group ArchiMate 3.2 Specification is normative. The implementation
uses independently authored interpretations of the public 3.2 reference cards
and does not copy the specification's relationship table. The current decision
set intentionally covers a bounded application and technology integration subset. Each row carries the public
evidence ID `opengroup-archimate-3.2-reference-cards`.

The additional #64 rows are independently authored interpretations of
the [public reference-card definitions](https://www.opengroup.org/sites/default/files/docs/downloads/n221p.pdf),
not a reproduction of the specification's complete relationship table. Each
additional row carries an `interpretation` sentence; matched API results return it
along with `decision`, `reasonCode`, and `evidenceSourceId`. Earlier reviewed
rows do not have row-specific interpretations. An unsupported result has no
row interpretation.

## Reviewed relationship rows (generated)

The table below is generated from `src/language/relationship-decisions.mts`.
Run `npm run generate:relationship-matrix` to update it; CI fails if the
checked-in table differs from the source rows.

<!-- BEGIN GENERATED RELATIONSHIP REGISTRY -->
| ArchiMate version | Source type | Relationship type | Target type | Decision | Evidence source | Interpretation |
|---|---|---|---|---|---|---|
| 3.2 | `ApplicationComponent` | `AssignmentRelationship` | `ApplicationFunction` | allowed | `opengroup-archimate-3.2-reference-cards` | — |
| 3.2 | `ApplicationFunction` | `AssignmentRelationship` | `ApplicationComponent` | disallowed | `opengroup-archimate-3.2-reference-cards` | — |
| 3.2 | `ApplicationFunction` | `RealizationRelationship` | `ApplicationService` | allowed | `opengroup-archimate-3.2-reference-cards` | — |
| 3.2 | `ApplicationService` | `RealizationRelationship` | `ApplicationFunction` | disallowed | `opengroup-archimate-3.2-reference-cards` | — |
| 3.2 | `ApplicationFunction` | `AccessRelationship` | `DataObject` | allowed | `opengroup-archimate-3.2-reference-cards` | — |
| 3.2 | `DataObject` | `AccessRelationship` | `ApplicationFunction` | disallowed | `opengroup-archimate-3.2-reference-cards` | — |
| 3.2 | `ApplicationService` | `ServingRelationship` | `BusinessProcess` | allowed | `opengroup-archimate-3.2-reference-cards` | — |
| 3.2 | `BusinessProcess` | `ServingRelationship` | `ApplicationService` | disallowed | `opengroup-archimate-3.2-reference-cards` | — |
| 3.2 | `ApplicationComponent` | `FlowRelationship` | `ApplicationComponent` | allowed | `opengroup-archimate-3.2-reference-cards` | Transfer between application components; direction follows the transferred item. |
| 3.2 | `ApplicationProcess` | `FlowRelationship` | `ApplicationProcess` | allowed | `opengroup-archimate-3.2-reference-cards` | Transfer between application processes; this does not assert a causal sequence. |
| 3.2 | `ApplicationProcess` | `TriggeringRelationship` | `ApplicationProcess` | allowed | `opengroup-archimate-3.2-reference-cards` | The source process precedes or causes the target process. |
| 3.2 | `ApplicationEvent` | `TriggeringRelationship` | `ApplicationProcess` | allowed | `opengroup-archimate-3.2-reference-cards` | An application state change starts or affects a process. |
| 3.2 | `ApplicationComponent` | `AssignmentRelationship` | `ApplicationProcess` | allowed | `opengroup-archimate-3.2-reference-cards` | The component performs the application process. |
| 3.2 | `ApplicationProcess` | `RealizationRelationship` | `ApplicationService` | allowed | `opengroup-archimate-3.2-reference-cards` | The application process implements exposed application behavior. |
| 3.2 | `ApplicationProcess` | `AccessRelationship` | `DataObject` | allowed | `opengroup-archimate-3.2-reference-cards` | The process observes or changes the data object. |
| 3.2 | `ApplicationService` | `ServingRelationship` | `ApplicationComponent` | allowed | `opengroup-archimate-3.2-reference-cards` | The service supplies functionality to a consuming component. |
| 3.2 | `TechnologyService` | `ServingRelationship` | `ApplicationComponent` | allowed | `opengroup-archimate-3.2-reference-cards` | The technology service supplies functionality to an application component. |
| 3.2 | `Node` | `AssignmentRelationship` | `Artifact` | allowed | `opengroup-archimate-3.2-reference-cards` | The node hosts a deployed artifact. |
| 3.2 | `ApplicationProcess` | `AssignmentRelationship` | `ApplicationComponent` | disallowed | `opengroup-archimate-3.2-reference-cards` | The performed behavior cannot be assigned responsibility for its performer. |
| 3.2 | `ApplicationService` | `RealizationRelationship` | `ApplicationProcess` | disallowed | `opengroup-archimate-3.2-reference-cards` | The exposed service cannot implement the concrete process. |
| 3.2 | `DataObject` | `AccessRelationship` | `ApplicationProcess` | disallowed | `opengroup-archimate-3.2-reference-cards` | The passive data object does not access the process. |
| 3.2 | `ApplicationComponent` | `ServingRelationship` | `TechnologyService` | disallowed | `opengroup-archimate-3.2-reference-cards` | A technology service provides the functionality to its application consumer, not conversely. |
| 3.2 | `Artifact` | `AssignmentRelationship` | `Node` | disallowed | `opengroup-archimate-3.2-reference-cards` | A deployed artifact is not the host that executes or stores the artifact. |
<!-- END GENERATED RELATIONSHIP REGISTRY -->

The fixture enumerates every additional row:
[`application-integration-semantics.json`](../../test/fixtures/synthetic/application-integration-semantics.json).

### Choosing a relationship

| Evidence from the source system | Reviewed relationship | Important limit |
|---|---|---|
| A data item moves between components or processes | Flow | State transfer, not proof of cause or service consumption. |
| One process or application event causes a process to start | Triggering | Mere data movement does not establish a causal order. |
| A process reads or changes a data object | Access | The opposite endpoint direction is explicitly disallowed here. |
| A service provides functionality to a component | Serving | Use provider → consumer; technology service → component is also reviewed. |
| A component performs a process | Assignment | Use performer → behavior. |
| A process implements an exposed application service | Realization | Use implementation → abstraction. |
| A node hosts an artifact | Assignment | Node → application component has **not** been reviewed. |

These are decisions for precise type triples, not rules for all instances of
an element class. In particular, unspecified event/process direction,
component-to-node assignment, and the complete set of component-to-component
relationships remain `unsupported`. A caller should select a reviewed row only
when its source evidence supports that meaning; an allowed tuple alone does
not prove that a particular architecture has the relationship.

A combination missing from the decision set is `unsupported`. Absence never
means `disallowed`. This avoids false conformance claims while the evidence set
is expanded and reviewed.

The legacy editor relationship maps remain implementation behavior for the
canvas's immediate gesture affordance. They are not standards evidence and are
not imported into the validator or DTO editor command decision. A failed DTO
command preserves existing model state. Imported relationships with unreviewed
tuples remain representable and can be referenced by another view; the editor
blocks authoring or retargeting a semantic relationship without a reviewed
`allowed` row. A changed endpoint checked against an explicit
`disallowed` row fails distinctly from an absent `unsupported` combination.

## Deterministic behavior

| Case | Result |
|---|---|
| Explicit supported row | `allowed` |
| Explicit reverse-direction row | `disallowed` |
| Unlisted or unknown combination | `unsupported` |
| Version other than 3.2 | `unsupported` with `VERSION_UNSUPPORTED` |
| Junction endpoint | `unsupported` with `JUNCTION_UNSUPPORTED` |
| Relationship endpoint | `unsupported` with `RELATIONSHIP_ENDPOINT_UNSUPPORTED` |

The XML validator reports an explicit `disallowed` row as
`SEMANTICS_RELATIONSHIP_DISALLOWED`. Unsupported cases remain warnings and do
not become silent denials. Diagnostics do not expose model identifiers unless
the caller opts into subject IDs.

## Scope limits

- Junction rules are not implemented beyond explicitly returning unsupported.
- Relationship-to-relationship rules are not implemented beyond explicitly
  returning unsupported.
- Viewpoints select and organize views; this service does not validate
  viewpoint contents.
- Organization profiles and custom specializations are caller-owned policy and
  are outside the built-in standard decision set.
- The ArchiMate specialization relationship is not yet assigned allow/deny
  rows. Custom concept specialization cannot be inferred safely from an XML
  type name alone.
- The service is integrated into standalone XML validation. Editor, import,
  export, and report paths can call the same public service but are not all
  wired to it yet.

## Test evidence

The tests use hand-authored fixtures classified as `SYNTHETIC` in
`test/fixtures/manifest.json`. They cover valid, invalid reverse-direction,
unknown, alternate-version, junction, and relationship-endpoint outcomes. The
#64 table-driven fixture exercises each new row through the pure service and
standalone XML validator and asserts unsupported scope. No
customer model, Archi source, GPL code, or copied Open Group artifact is used.
