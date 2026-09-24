# Issue contribution guide

Use the issue form that best matches the work. Before opening any issue, search
open and closed issues for duplicates and related work. If a matching issue
exists, add information there instead of opening a second issue.

## Scope and evidence

This repository is developed from public sources. Issue reports, examples,
reproductions, and attachments must use only `PUBLIC` or `SYNTHETIC` data:

- Do not include customer or private architecture material, real model exports,
  screenshots, names, hosts, IP addresses, credentials, costs, controls, or
  confidential project details.
- Prefer a minimal synthetic fixture or a link to a redistributable public
  fixture. State provenance for any fixture or copied/adapted material.
- When a claim depends on an external source, cite the original authoritative
  source and include the relevant version or retrieval date when useful. The
  Open Group is authoritative for ArchiMate standards; other tools are
  interoperability references only.

The existing [ArchiMate conformance or exchange-format form](../../.github/ISSUE_TEMPLATE/archimate-conformance.yml)
is the canonical route for suspected standards behavior and Model Exchange
interoperability gaps. Do not duplicate that form as a feature, bug, task, or
research report.

## Feature or gap

Use this form for a new capability, a documented limitation that should be
changed, or a product/roadmap gap. Describe the user problem and desired
outcome, not only an implementation idea.

Include a proposed direction with the reasoning and meaningful alternatives
considered. If the issue is intentionally an investigation rather than a
commitment to a solution, explicitly scope the investigation: define the
questions to answer, evidence to collect, and what result would make the work
ready for a follow-up implementation issue.

Separate strict blockers from related work. A strict blocker is a prerequisite
without which this issue cannot be accepted or safely implemented. Related
work is useful context or a possible follow-up, but must not silently expand
the acceptance boundary.

## Bug

Use this form for behavior that is incorrect, reproducible, or regressed.
Provide the smallest public or synthetic reproduction, expected behavior,
actual behavior, and version/runtime details. A diagnosis or proposed fix is
optional; reporters are not required to know the implementation cause.

If the behavior is required by an ArchiMate specification or exchange artifact,
use the conformance form instead and cite the original source. If it is a
documented unsupported boundary, say so and explain why the observed behavior
should change.

## Task or maintenance

Use this form for bounded engineering, documentation, tooling, release, or
maintenance work that is not itself a user-facing feature or bug report.
Define a verifiable outcome and the smallest useful scope.

Separate strict blockers from related work. Blockers are required prerequisites
or constraints; related work is context or a follow-up and is not part of the
task unless explicitly promoted into scope.

## Research or spike

Use this form when uncertainty must be reduced before committing to an
implementation or architectural decision. State the decision the research must
inform, the public sources to consult, the experiments or comparisons to run,
and explicit stopping criteria. Define the durable output, such as a research
record, decision, ADR, compatibility matrix, or a follow-up issue.

Research is not complete when notes merely exist: the stated decision,
evidence, limits, and durable output must be recorded so another contributor
can reuse the result. Keep all experiments and examples public or synthetic,
and cite original sources when external claims or artifacts are used.

## Relationships and maintainer triage

Search open and recently closed issues before filing. Say whether the request
is new, extends completed work, or duplicates an existing outcome. Add evidence
to a duplicate instead of opening another implementation issue. A follow-up
needs its own observed limitation and acceptance boundary.

Classify every referenced issue before linking it:

| Relationship | Use it when | GitHub representation |
| --- | --- | --- |
| Blocked by / blocking | One issue cannot be completed until the other is done | Add a native GitHub dependency in the issue sidebar, in the correct direction; also explain the reason in the body |
| Related to | Work shares context or needs coordination, but can finish independently | Ordinary issue reference in the body |
| Duplicate of | The requested outcome is already tracked | Add evidence to the existing issue and close the duplicate |
| Follow-up to | Completed work exposed a distinct limitation | Reference the completed issue or PR and describe the new outcome |

When a native dependency control is unavailable, retain the explicit issue
reference and reason in the body, then add the native link when it becomes
available. A shared file, possible future integration, or common topic alone
does not make an issue a blocker. Do not add redundant transitive dependencies
or connect every related issue into a dense blocking graph. Acceptance criteria
must describe observable behavior, not just activity such as “code added.”

During regular backlog review and whenever scope or a blocker changes,
maintainers should check that every strict prerequisite still blocks completion,
remove stale or redundant blocker links, reconcile the issue body with native
dependencies, and split independently releasable phases with different blockers.
Keep coordination-only references as related work. The forms provide structure;
no workflow automatically changes dependency links from untrusted issue text.

## Short examples (SYNTHETIC unless linked to public work)

- **Researched feature:** A request for opt-in compound layout can cite the
  existing public [#100](https://github.com/Tigon32/archimate-js/issues/100), identify current manual layout
  behavior, compare a built-in strategy with an optional engine, and accept only
  a reproducible layout patch with measured quality. State which earlier work
  is a strict prerequisite and which is merely related.
- **Standards defect:** A synthetic model's exchange import rejects a value
  required by a cited Open Group exchange artifact. Use the existing
  [conformance form](../../.github/ISSUE_TEMPLATE/archimate-conformance.yml)
  with the source/version, package/runtime, expected and actual behavior, and
  the smallest `SYNTHETIC` XML reproduction. Do not copy restricted tables.
- **Bug without a known solution:** “In version X on browser Y, reopening a
  synthetic two-node view loses one label.” Include reproduction and expected/
  actual behavior; leave the cause and implementation remedy open to triage.
- **Task with dependencies:** “Add a save round trip for DTO-owned edits” is
  blocked by the live editing command path; its issue body explains why and
  its native dependency points to that command issue. A related documentation
  update is referenced in prose if the save task can finish without it.
- **Soft relationship:** A headless outline and an export visual-quality gate
  might share a synthetic diagram fixture. Mention the shared fixture as
  related work; neither issue must block the other solely because of reuse.
