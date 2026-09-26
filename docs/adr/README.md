# Architecture decision records

ADRs record consequential decisions for this fork. They should be short, dated, and grounded in public sources or repository evidence.

## Status values

- `Proposed`: open for review.
- `Accepted`: active decision.
- `Implemented`: accepted decision whose described implementation is present and verified.
- `Superseded`: replaced by a newer ADR.
- `Rejected`: considered but not adopted.

Numbering: choose the next ADR number after checking the current `main` branch
and open pull requests. `npm run check:adr-registry` enforces the local index
and file sequence, and the pull request ADR collision CI check enforces open-PR
collisions. If either gate fails, renumber the ADR file, its index row, and all
links before retrying.

## ADR index

| ADR | Title | Status |
|---|---|---|
| 0001 | Public clean-room boundary | Proposed |
| 0002 | Standard-first interoperability | Proposed |
| 0003 | Deterministic report rendering | Proposed |
| 0004 | TypeScript-first incremental migration and module size | Accepted |
| 0005 | Coordinate concurrent agent development with expiring issue claims | Accepted |
| 0006 | Limit release attestation authority to a tag-only job | Accepted |
| 0007 | Use local deterministic verification before remote CI escalation | Implemented |
| 0008 | Establish a bounded third-party extension API boundary | Proposed |
| 0009 | Apply fail-closed post-merge branch cleanup | Proposed |
| 0010 | Keep diagram-js behind an engine-neutral editor boundary | Proposed |
| 0011 | Delegate agent work through frugal queen/worker-bee subagents | Proposed |
| 0012 | Use ELK Layered behind an optional compound-layout adapter | Accepted |
| 0013 | Use one worktree root and remove worktrees when work ends | Proposed |

## Template

```markdown
# ADR-NNNN: Title

Date: YYYY-MM-DD
Status: Proposed

## Context

## Decision

## Consequences

## References
```
