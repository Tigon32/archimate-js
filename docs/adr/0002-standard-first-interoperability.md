# ADR-0002: Standard-first interoperability

Date: 2026-09-23
Status: Proposed

## Context

The project needs trusted, portable ArchiMate diagrams. Portability depends on the ArchiMate standard and exchange artifacts, not on one implementation's native format.

Archi and other mature tools are valuable behavioral references, but their behavior must not silently become the normative source for this library.

## Decision

The normative order is:

1. The Open Group ArchiMate specification and conformance material.
2. The Open Group ArchiMate Model Exchange File Format and published schema/artifacts.
3. Documented interpretation in this repository's ADRs and research records.
4. Behavioral interoperability observations from public tools such as Archi.
5. Existing `archimate-js` behavior.

The first operational baseline targets explicit ArchiMate 3.x compatibility. ArchiMate 4 support must be version-addressable and must not reinterpret existing 3.x models silently.

## Consequences

- Native or tool-specific formats are adapters, not canonical truth.
- `.archimate` compatibility may be useful but is not the canonical persistence target.
- Import/export tests must make semantic equivalence visible.
- Any conformance claim requires evidence; do not imply certification.
- Relationship rules and metamodel decisions should be generated or tested from a versioned semantic source where feasible.

## References

- The Open Group ArchiMate overview: https://www.opengroup.org/archimate-forum/archimate-overview
- Open Group ArchiMate Model Exchange File Format: https://www.opengroup.org/open-group-archimate-model-exchange-file-format
- Archi project: https://github.com/archimatetool/archi
