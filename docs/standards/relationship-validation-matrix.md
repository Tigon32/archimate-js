# Relationship validation matrix plan

Tracks #11.

## Goal

Create a versioned validation matrix that makes ArchiMate relationship handling explicit, testable, and portable across report, import, export, and editor flows.

## Non-goals

- This file does not claim conformance coverage yet.
- This file does not reproduce protected ArchiMate specification tables.
- Archi behavior may be compared later, but it does not override the standard.

## Deterministic matrix record

Each validation row should use this shape:

| Field | Meaning |
|---|---|
| `archimate_version` | Version or version family the row applies to. |
| `source_type` | Concept or relationship source type under test. |
| `relationship_type` | Relationship type under test. |
| `target_type` | Concept or relationship target type under test. |
| `allowed` | Boolean expected outcome. |
| `evidence_source_id` | Public source ID from `docs/research/sources.yaml`. |
| `fixture_id` | Synthetic/public fixture proving the row, once available. |
| `test_id` | Automated test or manual oracle reference. |
| `notes` | Interpretation notes and known limitations. |

## Implementation sequence

1. Identify existing metamodel and rule tables in source.
2. Add a generated or data-driven relationship matrix file.
3. Add tests for one small relationship family first.
4. Expand coverage by layer and relationship family.
5. Add junction and relationship-to-relationship cases after base concept-to-concept coverage is stable.

## Acceptance gates

- Invalid combinations are rejected consistently.
- Valid combinations are accepted without UI-only special cases.
- Import, edit, and export paths use the same validation source.
- The matrix is version-addressable and does not silently reinterpret older models.
- Every row has public evidence or is explicitly marked as an implementation inference.
