---
title: "ADR-0013: Use one worktree root and remove worktrees when work ends"
status: "Proposed"
date: "2026-09-26"
authors: "Tigon32 repository maintainers"
tags: ["coordination", "agents", "worktrees", "disk-usage"]
supersedes: ""
superseded_by: ""
---

# ADR-0013: Use one worktree root and remove worktrees when work ends

## Status

**Proposed** — this record narrows agent worktree placement and cleanup rules
for ADR-0005 claimants. It does not authorize forced deletion, branch deletion,
or any GitHub mutation.

## Context

[ADR-0005](0005-concurrent-agent-development.md) requires a separate
worktree or checkout for each claimant, but does not say where that worktree
lives or when it is removed. [ADR-0009](0009-post-merge-branch-cleanup.md)
covers branch deletion and only permits removing the current session's own
clean worktree.

As measured on 2026-09-26, different harnesses had therefore chosen different
locations:

- a sibling `archimate-js-worktrees/` directory, with 44 worktrees using about
  7.7 GB;
- the system temporary directory, with 19 worktrees using about 3.8 GB; and
- per-session state directories, with 19 worktrees using about 4.7 GB.

That left 82 registered worktrees and about 16 GB of checkout data while the
disk was 99% full. Sixty-three registered worktrees belonged to merged pull
requests, five belonged to closed pull requests, and only about eleven appeared
active.

Each worktree runs its own `npm ci` when local gates are needed. Its
`node_modules` directory is about 230 MB, so dependency installs are the
dominant disk cost. Prompt removal of finished worktrees therefore matters
more than fine-grained cleanup inside an active checkout.

Worktrees outside the project tree also confuse humans. Work appears scattered
across harness-specific locations, and it is not obvious which checkout is the
canonical repository checkout.

## Decision

- **DEC-001 — One root:** Every agent worktree lives under the sibling
  directory `<parent-of-repo>/archimate-js-worktrees/`. Agent worktrees must
  not be created in the system temporary directory, a harness session or state
  directory, or inside the canonical checkout.
- **DEC-002 — Layout and naming:** Worktrees use the layout
  `archimate-js-worktrees/<harness>/<issue>-<slug>`, for example
  `copilot-cli/issue-364-multi-view` or `codex/issue-354-elk-spike`.
  Review-only or detached checkouts use `<harness>/review-pr-<n>`. The
  directory name must identify the harness and the issue or pull request.
  There is one worktree per claimed branch.
- **DEC-003 — Created at claim, removed at lease end:** The claimant creates
  the worktree after posting its ADR-0005 claim. It removes the worktree when
  the lease ends: release or handoff after merge or close, or abandonment.
  Cleanup is part of the same closeout step. Use
  `git worktree remove <path>` without `--force`, then `git worktree prune`.
  Git's refusal on uncommitted or untracked work is the safety check.
  Review-only checkouts are removed when the review ends.
- **DEC-004 — Handoff keeps the worktree:** When work is handed off unfinished,
  the worktree stays in place. The handoff record's branch plus the naming rule
  let the receiver find it. The receiver removes it when its own lease ends.
- **DEC-005 — Orphan sweep:** Any agent or maintainer may list orphan
  candidates in a dry run. A worktree is an orphan only when all of these
  predicates hold: its pull request is merged or closed; its branch has no live
  or unresolved ADR-0005 lease; it is not needed for a handoff, audit trail, or
  recovery (ADR-0009 DEC-2 and DEC-4 still apply); it is clean
  (`git status --porcelain` is empty, ignoring only OS metadata files such as
  `.DS_Store`); and it has been untouched for at least 24 hours. Remove orphans
  with the same non-forcing command. Ignored build output (`node_modules`,
  `.ci-build`, `dist`) and OS metadata may be deleted first so that the
  non-forcing removal can finish; this never touches tracked or untracked source.
  This narrows ADR-0009 DEC-5's "never delete another session's worktree" only
  for worktrees that meet every orphan predicate. The branch itself is
  preserved: removing a worktree deletes a checkout, not commits or refs.
  Anything that fails a predicate is preserved. No predicate may be waived for a
  cross-session sweep. An explicit maintainer instruction that overrides this
  decision is recorded as an ADR-0005 audit comment and is not a standing
  exception.
- **DEC-006 — Dependencies:** Install `node_modules` in a worktree only when
  gates must run there. Disk cost is controlled mainly by prompt worktree
  removal. Evaluating a shared package store is future work, recorded in
  implementation notes and not decided here.
- **DEC-007 — Migration:** No new worktrees are created in old locations from
  now on. Existing finished worktrees there are removed by their owner, or by
  the DEC-005 sweep. An active worktree may be moved with `git worktree move`
  by its owner and needs no new claim because the ADR-0005 lease records the
  branch, not the path.

## Consequences

### Positive

- **POS-001:** Humans can inspect one predictable root to see agent worktrees
  and distinguish them from the canonical checkout.
- **POS-002:** Finished work no longer depends on reboot behavior, harness
  session retention, or per-tool cleanup conventions.
- **POS-003:** Closeout and review cleanup recover the largest disk cost:
  repeated checkout-local dependency installs.
- **POS-004:** Handoffs remain safe because unfinished worktrees are preserved
  and discoverable through the branch and directory naming rules.
- **POS-005:** Orphan cleanup becomes reviewable and repeatable without
  weakening Git's uncommitted-work safety checks.

### Negative

- **NEG-001:** Agents and harness wrappers must agree on one local path
  convention instead of using their default workspace locations.
- **NEG-002:** Active unfinished work can still consume disk during a handoff
  because the worktree is deliberately preserved.
- **NEG-003:** A dry-run orphan sweep still needs pull-request state,
  ADR-0005 claim records, local cleanliness, and age checks before removal.
- **NEG-004:** Worktrees moved from old locations may leave stale habits or
  external scripts that need manual correction.

## Alternatives considered

### Keep per-harness locations

- **ALT-001:** Allow each harness to keep choosing its own preferred worktree
  root.
- **ALT-002:** Rejected because humans then need to search multiple roots and
  cannot easily tell which checkout is canonical or which worktrees are stale.

### Use the system temporary directory

- **ALT-003:** Put agent worktrees under the system temporary directory and
  rely on temporary-directory lifecycle for cleanup.
- **ALT-004:** Rejected because it hides active work from repository operators
  and cleanup depends on reboot or host-specific retention behavior.

### Put worktrees inside the repository

- **ALT-005:** Create agent worktrees below the canonical checkout.
- **ALT-006:** Rejected because nested checkouts risk being scanned by tools
  such as `tsc`, `vitest`, and `eslint`, and they confuse the boundary between
  the canonical checkout and disposable worktrees.

## Implementation notes

- **IMP-001:** Queen/closeout checklists should include: after posting release
  or handoff, remove any finished owned worktree with
  `git worktree remove <path>` and run `git worktree prune`.
- **IMP-002:** A dry-run sweep should combine Git's registered worktree list,
  pull-request state, and ADR-0005 claim records before proposing removals.
  One possible starting point is:

  ```sh
  git worktree list --porcelain
  gh pr list --state all --json number,state,headRefName,mergedAt,closedAt
  # Re-read ADR-0005 claim records for each candidate branch before removal.
  ```

- **IMP-003:** For each candidate, dry-run output should include the worktree
  path, branch, pull-request state, claim status, cleanliness result, last
  touched time, and the exact command that would be run.
- **IMP-004:** Removal automation, if added later, must remain non-forcing and
  preserve every candidate that fails any DEC-005 predicate.
- **IMP-005:** A shared package store or cache strategy may be evaluated later,
  but this ADR does not select npm, pnpm, or any other dependency-store change.
- **IMP-006 — Initial migration sweep (2026-09-26):** Before this ADR existed,
  a one-time cleanup ran at the maintainer's explicit instruction. It is
  recorded here as the audit record DEC-005 requires for overrides. It removed
  66 registered worktrees across the three old locations:
  - 39 through non-forcing `git worktree remove`;
  - 27 whose registration was already gone. Their directories were deleted only
    after checking that every branch tip was reachable from `main` or a remote
    branch.

  Every removed worktree belonged to a merged or closed PR, had no live
  ADR-0005 lease, and had no uncommitted or untracked source (OS metadata
  aside). No branch or commit was deleted. The idle-time predicate was not
  applied; many checkouts only looked recently touched because `.DS_Store`
  had been written and a rebase had updated them. Result: about 16 GB used by
  82 registered worktrees became about 3 GB used by 19. Active, open-PR,
  unmerged and recovery worktrees were preserved.

## References

- **REF-001:** [ADR-0005: Coordinate concurrent agent development with
  expiring issue claims](0005-concurrent-agent-development.md).
- **REF-002:** [ADR-0009: Apply fail-closed post-merge branch
  cleanup](0009-post-merge-branch-cleanup.md).
- **REF-003:** [ADR-0011: Delegate agent work through frugal queen/worker-bee
  subagents](0011-frugal-subagent-orchestration.md).
- **REF-004:** [Manual shared-account agent coordination
  runbook](../contributing/agent-coordination.md).
- **REF-005:** [Git worktree documentation](https://git-scm.com/docs/git-worktree).
