# ADR-0005: Coordinate concurrent agent development with expiring issue claims

Date: 2026-09-24
Status: Accepted

## Context

Several agents and independent harnesses may work on this public repository at
once. A shared checkout, duplicate issue selection, or two writes to the same
branch can discard work. Long-lived ownership can also strand an issue when an
agent stops. The existing issue guide distinguishes strict blockers from related
work, but does not define ownership of active implementation.

GitHub's Assignees field holds eligible GitHub accounts, permits multiple
assignees, and has no native expiring or exclusive claim. The add-assignees API
adds to the existing set. An agent run ID cannot itself be assigned, and a
read-then-assign sequence is not an atomic lock. The current connected account
is shared between harnesses, so its assignment alone does not identify a run.

## Decision

### Identity and claim

1. The target state is one stable, distinct, assignable GitHub machine/user
   account per harness. A run receives a unique opaque actor ID (for example
   `codex-work-<workspace-id>-<UTC-start>`), and the exact actor ID appears in
   the machine-readable claim record and the PR. A subagent delegated by the
   claimant inherits the parent's lease unless it independently claims a
   separate issue. Until distinct accounts and the serialized controller exist,
   use the manual shared-account protocol in
   [`docs/contributing/agent-coordination.md`](../contributing/agent-coordination.md).
   A shared assignee is never evidence of exclusive ownership.
2. Before editing, search open/closed issues and PRs; identify strict
   dependencies, existing claims, and likely shared files. Claim the smallest
   independently reviewable issue or child slice. One active implementation
   lease per issue; reviewers may participate without taking the lease. Do not
   claim an umbrella when implementing only one child.
3. A claim record uses the versioned JSON contract in the runbook. It contains
   `schema`, `record_type`, `issue`, `actor_id`, `github_login`, `lease_id`
   (unpredictable token), `epoch` (monotonic fencing number), lease timestamps,
   `branch`, `state`, and a decimal-string `claim_comment_id`. A new `claim` or
   active `takeover` always has `claim_comment_id: null` in the record because
   a comment cannot know its own GitHub ID before posting; the posted comment
   ID becomes the authoritative original claim ID in external fence state after
   an immediate re-read, without editing the record. Later records repeat that
   ID. `supersedes_claim_comment_id` is the sole replacement lineage field.
   `issue` and `epoch` are positive integers; the first epoch is 1, replacement
   and receiver claims use exactly the previous valid epoch plus 1, and
   same-lease transitions repeat the epoch. Unknown fields, duplicate keys,
   malformed JSON, and ambiguous history fail closed. The machine-readable JSON
   block, not prose or the assignee, is authoritative.

### Expiry and ownership transitions

4. An active lease expires **two hours of elapsed UTC wall-clock time** after
   the last accepted heartbeat. The claimant renews at least every **15
   minutes** while working, including while waiting on long CI runs. "Agentic
   development time" is not consistently measurable across harnesses, so the
   expiry clock uses wall time. A worker must stop writes if a renewal fails or
   the lease is expired. Closing/merging the issue or explicitly handing off
   releases it immediately.
5. In the target state, all claim, renew, release, and takeover operations go
   through one serialized claim controller. Under the controller's per-issue
   serialization, a claim succeeds only if no live lease exists; renew/release
   requires the current lease ID and epoch. Takeover after expiry creates a new
   epoch, rechecks the issue/PR state, and records the previous branch and an
   audit comment. Never delete or force-push another actor's branch. Before
   each GitHub mutation or push, the worker checks the current lease ID/epoch;
   the controller rejects stale actors. Assignment changes are made only by the
   controller and never clear unrelated human assignees. A manual maintainer
   override uses the same audit path.

   During the interim manual phase, comments cannot provide atomic compare and
   set. Therefore a claimant must re-read and fence-validate immediately after
   posting and before every edit, commit, push, PR mutation, merge, issue
   mutation, and scheduled heartbeat. More than one unexpired active claim,
   malformed authoritative JSON, a missing original claim, or any mismatch
   fails closed: the harness stops writes and does not select a winner by
   timestamp, lexical order, assignee, or comment order. Expiry alone is not
   enough for takeover; the observation and maintainer-acknowledgement steps in
   the runbook are required.
   Fence reads are required at every mutation boundary. A contiguous local
   edit batch is additionally revalidated every five minutes or 20 files, and
   no mutation may use a fence read older than 60 seconds.
   Heartbeats require recent observed work progress, stop after 30 minutes of
   inactivity, and cannot extend a lease beyond eight hours from
   `lease_started_at` without a maintainer re-acknowledgement. Liveness is
   determined from the newest valid record for the lease. Every active record
   satisfies `expires_at <= heartbeat_at + 2 hours`.
6. Reconcile expired leases on claim/renew/release events and with a periodic
   sweeper (target every 15 minutes). The sweeper re-reads the lease and epoch
   before clearing the matching assignee/record; it must not clear a renewed
   or replacement claim. Scheduled GitHub Actions may be delayed or dropped,
   so expiry is enforced by the controller at write time, not guaranteed to
   remove the visible assignee at the exact expiry instant. Alert on missed
   sweeps and allow a documented manual release.

### Isolation, integration, and throughput

7. Each claimant uses a separate worktree/checkout and unique branch such as
   `agent/<actor-id>/issue-<number>-<slug>`, based on current `main`. Never
   edit another actor's worktree or branch. Keep changes scoped to the claimed
   issue; coordinate shared files in its issue/PR before editing. Refresh from
   `main` before PR creation and merge; link the issue and claim ID in the PR.
8. Split large issues by independently testable outcomes and real blockers.
   Use native issue dependencies for strict sequencing and ordinary references
   for related work. Independent child issues can proceed concurrently, with
   separate leases and PRs. Keep PRs small; report handoff state, remaining
   risks, and test evidence when a lease ends.
9. Require the repository's checks and appropriate review before merging.
   Protect `main` with required checks and reviews; use a merge queue if merge
   contention warrants it, and ensure required Actions also respond to
   `merge_group` when a queue is enabled. Never bypass a failed check or
   overwrite another PR's branch to resolve a conflict. A claimant releases
   its lease after merge/closure and updates any dependent issue.

### Implementation and rollout

10. The first rollout is the manual shared-account phase. Use the canonical
    versioned JSON records, unique actor and lease IDs, UTC expiry, explicit
    release, and the fail-closed fence in the runbook. Manual records are
    coordination signals rather than an atomic lock; they do not make comments,
    assignees, or scheduled jobs transactional. Do not start two agents on the
    same issue. Provision distinct assignable accounts and scoped credentials
    before treating assignment as harness identity.
11. Build the controller as one trusted workflow/service that owns all lease
    mutations. For an Actions implementation, put **every** claim operation,
    renewal, release, and sweep through a common per-issue concurrency group;
    use a pending queue that does not replace earlier requests and do not
    cancel an in-progress operation. Persist records in a store with a
    conditional update or serialize every writer through the same controller;
    GitHub issue comments/assignee updates alone do not offer compare-and-set.
    Treat issue titles, bodies, and comments as untrusted. Grant only the
    necessary issue permissions, keep secrets out of untrusted PR contexts,
    and test simultaneous claim, renewal versus sweep, stale release, crash,
    and takeover before enabling automatic assignment changes. If a workflow
    cannot guarantee a shared serialization domain across all clients, use a
    transactional external store/controller instead.

## Consequences

- Assignment shows the responsible harness account once distinct identities
  exist; the lease record disambiguates runs and prevents stale workers from
  mutating the issue through the controller. Existing GitHub API clients that
  write directly remain outside this guarantee and need migration/enforcement.
- Two-hour leases reduce abandoned claims but require heartbeats through CI and
  long investigations. An offline worker may lose the claim and must stop,
  inspect the new owner, and hand off rather than silently resume.
- A serialized controller and reconciliation workflow add operational cost.
  They are follow-up implementation work; this ADR alone does **not** deploy
  auto-release, make assignment atomic, or enforce protected-branch settings.
- Separate worktrees and small PRs increase useful concurrency while retaining
  one integration gate for `main`.
- The manual protocol deliberately stops on uncertainty and may require a
  maintainer-mediated handoff. It does not weaken, replace, or pre-implement
  the serialized controller and automatic expiry specified for
  [#140](https://github.com/Tigon32/archimate-js/issues/140).

## References

- Repository issue routing: [`../contributing/issues.md`](../contributing/issues.md).
- Manual shared-account operator runbook:
  [`../contributing/agent-coordination.md`](../contributing/agent-coordination.md).
- GitHub assignees: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/assigning-issues-and-pull-requests-to-other-github-users.
- GitHub assignee REST semantics: https://docs.github.com/en/rest/issues/assignees.
- GitHub Actions concurrency: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency.
- Scheduled workflow caveats: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows.
- GitHub issue dependencies: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies.
- Branch protection and merge queue: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches and https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue.
- Git worktrees: https://git-scm.com/docs/git-worktree.
