---
title: "ADR-0011: Delegate agent work through frugal queen/worker-bee subagents"
status: "Proposed"
date: "2026-09-26"
authors: "Tigon32 repository maintainers"
tags: ["coordination", "agents", "cost-control"]
supersedes: ""
superseded_by: ""
---

# ADR-0011: Delegate agent work through frugal queen/worker-bee subagents

## Status

**Proposed** — this record defines the repository's frugal agent orchestration
rules for concurrent public-source work. It does not authorize bypassing the
claim, review, or merge controls in ADR-0005, ADR-0007, or ADR-0009.

## Context

Several agent harnesses, including Copilot CLI and Codex, can work concurrently
under the expiring issue-claim model in
[ADR-0005](0005-concurrent-agent-development.md). That model protects active
work with issue claims, isolated worktrees, heartbeats, handoffs, and
fail-closed fencing, but it does not prescribe how much reasoning context one
agent should carry while work is split across child issues.

Long single-agent sessions accumulate large context, dilute focus, and raise
premium-unit cost. Subagents isolate context, make prompts reviewable, and let
the orchestrator keep only coordination state. This ADR uses the lightweight
queen/worker-bee naming pattern: the queen coordinates and integrates; workers
perform bounded implementation, review, audit, or research tasks.

Installed orchestration options need evaluation before broader adoption:

- native harness subagents;
- ruflo `hive-mind`, a claude-flow v3 mode where a queen-led process spawns
  external Claude Code workers;
- ruflo `swarm`, a peer-style orchestration mode;
- `ruvnet-brain`, a local lessons and decision ledger under
  `~/.config/ruvnet-brain` used by ruflo tooling.

Ruflo invocations auto-start a background daemon. External orchestration also
creates new process, prompt-boundary, and measurement risks, so it must be
treated as an experiment until repository evidence shows it is at least as
frugal and as governable as native subagents.

## Decision

- **DEC-001 — Mandatory delegation:** Implementation, review, and
  audit/research work MUST be delegated to subagents. The orchestrating agent,
  or queen, performs only planning, ADR-0005 fencing, claims, heartbeats,
  handoffs, merges, and GitHub mutations.
- **DEC-002 — Worker isolation:** Worker-bees receive complete,
  self-contained prompts, work only in their assigned isolated worktree, and
  never mutate GitHub, claims, or other worktrees.
- **DEC-003 — One implementer and reviewer:** Each child issue gets exactly
  one implementer and one reviewer. Re-review uses the same reviewer instead
  of spawning new agents, and the implementer fixes only confirmed findings.
- **DEC-004 — Parallelism cap:** Run at most three parallel workers, only on
  child issues without file overlap. Audit work uses read-only explore agents
  unless a maintainer explicitly assigns an implementation child issue.
- **DEC-005 — Merge gate unchanged:** Required checks, current head, resolved
  review threads, an independent reviewer pass, and merge with
  `--match-head-commit` remain mandatory.
- **DEC-006 — External orchestration is conditional:** Orchestration beyond
  native subagents, including ruflo `hive-mind`, ruflo `swarm`, and
  `ruvnet-brain`, is permitted only as a measured experiment until this ADR's
  evidence log shows it is at least as frugal. Any ruflo run must end with
  `ruflo daemon stop` and a leftover-process check. External processes receive
  only public or synthetic prompts and no credentials.
- **DEC-007 — Evidence-driven revision:** After every measured batch, append a
  dated entry to the Evidence log and update the DEC-006 verdicts as
  `keep`, `conditional`, or `reject`.

## Evaluation metrics

- **MET-001 — Premium units per closed issue:** Total billed premium units for
  the measured batch divided by the number of child issues closed by merged or
  intentionally abandoned PRs in that batch.
- **MET-002 — Tokens per closed issue:** Input, output, and cache-read tokens
  for the measured batch divided by closed child issues. Report the token
  classes separately; do not collapse them into one number.
- **MET-003 — Wall-clock per closed issue:** Elapsed time from first valid
  child-issue claim to merge or closure, divided by closed child issues.
- **MET-004 — Pushes until green CI:** Number of pushes to the PR branch before
  all required checks are green.
- **MET-005 — Confirmed review findings per PR:** Findings accepted by the
  implementer or maintainer, excluding speculative or rejected comments.
- **MET-006 — Rework cycles:** Distinct implementer fix rounds after initial
  review or CI failure.
- **MET-007 — Governance violations:** Count any ADR-0005, ADR-0009, or
  ADR-0001 boundary violation, including stale fences, unsafe cleanup,
  unauthorized GitHub mutation, or non-public prompt/material exposure.

### Measurement method

- **MEA-001:** Native harness measurements come from harness session usage
  records, task-call counts, shell-call counts, PR history, and check history.
- **MEA-002:** External orchestration measurements come from the external
  tool's own reported usage when available.
- **MEA-003:** If an external tool does not report a metric, record
  `not measurable`; never estimate silently.
- **MEA-004:** Evidence entries must name the measured period, included PRs or
  child issues, included models or tools when available, caveats, and the
  resulting verdict for each orchestration option that changed status.

## Verdict table

| Option | Status | Evidence |
|---|---|---|
| Native subagents (queen/worker-bee) | Adopted | Historical native-harness batch shows useful isolation with provisional upper-bound cost; continue measuring. |
| ruflo `hive-mind` | Under evaluation | No repository batch measurement yet; must prove daemon cleanup, public-only prompts, and frugality. |
| ruflo `swarm` | Under evaluation | No repository batch measurement yet; must prove lower or equal cost and governance clarity. |
| `ruvnet-brain` lessons | Under evaluation | No repository batch measurement yet; local lessons ledger must avoid private content and show measurable benefit. |

## Evidence log

Usage figures come from the harness's per-session usage records (premium units, tokens, tool-call counts). Those records are local and not published; each entry cites the session ID so a maintainer with access can re-query them. Figures without such a source are marked *unverified*.

- **2026-09-26 — Baseline:** Historical prior session (`1b38f0eb`) using a
  hive-queen/worker naming pattern with native harness subagents. It merged
  nine PRs from `hive-*` branches: eight from worker branches (#265, #267,
  #269, #272, #274, #283, #284, #285) and one from a queen integration branch
  (#276). Whole-session usage was 917 premium units across six models
  (679 model API calls; 109.1 M input, 0.29 M output, 106.0 M cache-read
  tokens), with 26 subagent task calls and 648 shell calls, re-verified by the
  queen from the session usage records on 2026-09-26. Caveat: session totals also
  include non-hive work, so per-PR cost is an upper bound of about 102 premium
  units per merged PR. Verdict: queen/worker-bee pattern — keep (provisional);
  ruflo `hive-mind` — pending measurement; ruflo `swarm` — pending;
  `ruvnet-brain` — pending.

## Consequences

### Positive

- **POS-001:** The queen's context stays focused on issue selection, lease
  fencing, integration state, and merge safety.
- **POS-002:** Worker prompts become bounded artifacts that can be checked for
  public/synthetic-only content before delegation.
- **POS-003:** One implementer and one reviewer per child issue reduces
  duplicate review churn while preserving independent scrutiny.
- **POS-004:** The three-worker cap keeps concurrency useful without turning
  ADR-0005 coordination into a high-contention scheduler.
- **POS-005:** External orchestration can be explored without becoming the
  default before cost and governance evidence exist.

### Negative

- **NEG-001:** The queen must invest more effort in prompt completeness,
  dependency ordering, and file-overlap checks before workers start.
- **NEG-002:** Small child issues may carry delegation overhead that exceeds
  the savings from context isolation.
- **NEG-003:** Native and external tools may report usage differently, making
  some comparisons incomplete until instrumentation improves.
- **NEG-004:** Ruflo daemon lifecycle management adds an operational cleanup
  requirement that native subagents do not need.

## Alternatives considered

### Continue long single-agent sessions

- **ALT-001:** Keep one agent responsible for planning, implementation,
  review, audit, and integration across many child issues.
- **ALT-002:** Rejected because accumulated context raises cost, weakens
  focus, and makes independent review less clear.

### Adopt ruflo without measurement

- **ALT-003:** Make ruflo `hive-mind`, ruflo `swarm`, or `ruvnet-brain` the
  default orchestration layer based on advertised capability.
- **ALT-004:** Rejected because external processes, daemon lifecycle, and
  usage reporting must prove frugality and governance fit in this repository.

### Ban external orchestration

- **ALT-005:** Forbid ruflo and local lessons tooling outright.
- **ALT-006:** Rejected as premature because measured experiments may show
  better cost, throughput, or repeatability without weakening public-source
  boundaries.

## Implementation notes

- **IMP-001:** The queen checks ADR-0005 claims, child dependencies, and file
  overlap before launching any worker.
- **IMP-002:** Worker prompts must include the target issue, target worktree,
  branch, allowed files or surfaces, validation command, public-data boundary,
  and a prohibition on GitHub, claim, and cross-worktree mutations.
- **IMP-003:** Reviewer prompts must include the exact branch or diff scope,
  the acceptance criteria, and an instruction to report only confirmed,
  actionable findings.
- **IMP-004:** Re-review goes back to the same reviewer whenever possible; a
  replacement reviewer needs a recorded reason in the PR or issue handoff.
- **IMP-005:** Ruflo experiments must record start/stop time, daemon cleanup,
  leftover-process check result, reported usage or `not measurable`, and any
  governance exceptions.
- **IMP-006:** The queen remains the only actor that pushes, opens or updates
  PRs, merges, comments claim records, or closes issues.
- **IMP-007:** Evidence-log updates are part of the batch closeout, not a
  separate retrospective that can be skipped after merge.

## References

- **REF-001:** [ADR-0005: Coordinate concurrent agent development with
  expiring issue claims](0005-concurrent-agent-development.md).
- **REF-002:** [ADR-0007: Use local deterministic verification before remote
  CI escalation](0007-local-deterministic-verification-before-remote-ci.md).
- **REF-003:** [ADR-0009: Apply fail-closed post-merge branch
  cleanup](0009-post-merge-branch-cleanup.md).
- **REF-004:** [ADR-0010: Keep diagram-js behind an engine-neutral editor
  boundary](0010-diagram-engine-boundary.md).
- **REF-005:** [Manual shared-account agent coordination
  runbook](../contributing/agent-coordination.md).
- **REF-006:** [ruvnet/claude-flow](https://github.com/ruvnet/claude-flow),
  referenced for ruflo/claude-flow v3 orchestration experiments.
