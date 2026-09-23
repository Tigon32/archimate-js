# Relationship validation matrix

Tracks #11.

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
set intentionally covers a small application-layer sample across assignment,
realization, access, and serving relationships. Each row carries the public
evidence ID `opengroup-archimate-3.2-reference-cards`.

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
unknown, alternate-version, junction, and relationship-endpoint outcomes. No
customer model, Archi source, GPL code, or copied Open Group artifact is used.
