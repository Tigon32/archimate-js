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

## Evidence boundary

The Open Group ArchiMate 3.2 Specification is normative. The implementation
uses independently authored interpretations of the public 3.2 reference cards
and does not copy the specification's relationship table. The current decision
set intentionally covers a bounded application and technology integration subset. Each row carries the public
evidence ID `opengroup-archimate-3.2-reference-cards`.

The additional #64 rows below are independently authored interpretations of
the [public reference-card definitions](https://www.opengroup.org/sites/default/files/docs/downloads/n221p.pdf),
not a reproduction of the specification's complete relationship table. Each
new row carries an `interpretation` sentence; matched API results return it
along with `decision`, `reasonCode`, and `evidenceSourceId`. An unsupported
result has no row interpretation.

## Application and integration additions (#64)

| Source | Relationship | Target | Decision | Generated-model use |
|---|---|---|---|---|
| ApplicationComponent | Flow | ApplicationComponent | allowed | Directional transfer between components. |
| ApplicationProcess | Flow | ApplicationProcess | allowed | Directional transfer between processes. |
| ApplicationProcess | Triggering | ApplicationProcess | allowed | Temporal or causal process succession. |
| ApplicationEvent | Triggering | ApplicationProcess | allowed | Event propagation into a process. |
| ApplicationComponent | Assignment | ApplicationProcess | allowed | Allocate a process to its performer. |
| ApplicationProcess | Realization | ApplicationService | allowed | Process implements exposed service behavior. |
| ApplicationProcess | Access | DataObject | allowed | Process reads or writes passive data. |
| ApplicationService | Serving | ApplicationComponent | allowed | An exposed service supplies a consuming component. |
| TechnologyService | Serving | ApplicationComponent | allowed | Technology functionality supports an application component. |
| Node | Assignment | Artifact | allowed | Deployment of an artifact on a node. |

The corresponding explicit reverse rows are `disallowed` for Assignment
(process → component and artifact → node), Realization (service → process),
Access (data → process), and Serving (component → technology service).
ApplicationComponent → ApplicationService Serving remains `unsupported`: the
public reference-card definition alone does not establish a prohibition for
that exact tuple, and existing synthetic samples use it. Flow and Triggering are directional, but the opposite
direction could itself have a valid meaning, so there are no blanket reverse
denials for those types. The fixture enumerates every additional row:
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

The legacy editor relationship maps remain implementation behavior. They are
not treated as standards evidence and are not imported into the validator.

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
