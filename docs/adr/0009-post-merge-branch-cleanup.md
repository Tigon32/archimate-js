# ADR-0009: Apply fail-closed post-merge branch cleanup

Date: 2026-09-25
Status: Proposed

## Context

Merged branches can accumulate in local and remote repositories, but branch
age or apparent inactivity does not establish that a branch is safe to delete.
An open pull request, a live or ambiguous ownership lease, an outstanding
handoff, or a need to retain recovery history can make an apparently stale
branch operationally important. In a public repository, branch cleanup must
also preserve the clean-room boundary and avoid exposing or destroying
session-specific work.

The repository's coordination rules are deliberately fail-closed: ambiguous
ownership is preserved for maintainer review, and recovery retains original
branches as audit links. Cleanup must not undermine those guarantees.

## Decision

1. Before any branch cleanup, inventory local and remote branches and produce
   a dry-run list of proposed actions and preserved branches with reasons.
   Resolve the target repository, remote, and current `main` explicitly.
   Refresh the inventory and verify each candidate immediately before acting.
   A failed or ambiguous check means preserve the branch; do not infer safety
   from age, naming, an absent recent commit, or a successful dry run.
2. A remote branch may be deleted only when **all** of the following are
   verified:
   - it has no open pull request, including a draft pull request;
   - it has no active or takeover-pending lease, and ownership history is not
     ambiguous; an expired lease whose ADR-0005 takeover, handoff, or release
     path remains unresolved is ineligible, because expiry alone never grants
     deletion authority;
   - it is not needed for a handoff, audit trail, or recovery;
   - it is neither the repository's default branch nor protected by a branch
     rule or other protection; and
   - the branch-tip commit is reachable from the current, freshly fetched
     `main`.

   If any condition is false or cannot be checked, preserve the remote branch
   and refer the case to a maintainer. A commit reachable from `main` does not
   by itself establish that the other conditions are satisfied.
3. Record the observed branch-tip commit for each candidate in the dry run.
   Re-read the tip immediately before deletion and abort if it differs from
   the recorded tip. Deletion must also be conditional on the ref still
   pointing to that commit at the instant of deletion (ref-compare/expected
   tip), where the operation supports it. If conditional deletion is not
   supported or cannot be verified, fail closed rather than using an
   unconditional delete. Apply this gate to both remote and local branches.
4. Preserve active, ambiguous, unmerged, and auditable branches. In particular,
   never delete another actor's branch as part of takeover or recovery; the
   coordination runbook's handoff and recovery procedures continue to apply.
5. A local branch deletion must meet the same eligibility requirements, with
   its upstream branch state verified, and the branch must not be checked out
   in any worktree. Local branch and worktree cleanup must be non-forcing and
   preserve uncommitted or untracked work. Remove only a verified, clean
   worktree owned by the current session, using the normal Git worktree
   operation without a force option. Do not recursively delete a session
   directory, and never delete another session's worktree or directory. Do not
   treat pruning Git metadata as permission to remove an existing directory.
6. Any future cleanup automation is out of scope for this ADR. Document its
   proposed behavior and failure handling, but keep it disabled until this ADR
   is accepted and a separate implementation is reviewed and tested. That
   implementation must preserve the inventory/dry-run gate, revalidate every
   candidate, fail closed on unavailable or ambiguous state, and avoid
   destructive local filesystem operations.

## Consequences

### Positive

- Cleanup has explicit evidence requirements rather than relying on branch age
  or operator guesswork.
- Active work, handoffs, and recovery evidence remain available, consistent
  with the ownership and recovery safeguards in ADR-0005.
- A dry-run inventory makes intended changes reviewable before any deletion.
- Non-forcing local cleanup reduces the risk of losing uncommitted work or
  disrupting another session.

### Negative

- Some safely merged branches will remain when pull-request, lease, protection,
  tip-compare support, or audit state cannot be verified.
- Inventory, dry-run review, and per-branch revalidation add maintainer effort.
- This decision provides no automatic cleanup; accumulated branches may need
  explicit manual review until a separate implementation is accepted.

## Alternatives

- **Delete branches based on age or inactivity:** rejected because neither
  proves that work is merged, unowned, or no longer needed for audit or
  recovery.
- **Delete every branch after pull-request merge:** rejected because a merge
  alone does not rule out an active lease, handoff, protection requirement, or
  recovery need.
- **Enable scheduled cleanup immediately:** rejected because automation could
  act on stale or incomplete GitHub state and this ADR does not authorize an
  implementation.
- **Leave cleanup entirely undefined:** rejected because it gives operators no
  consistent, reviewable boundary for safe manual cleanup.

## Implementation notes

- This proposal authorizes no branch deletion and changes no GitHub settings.
- An implementation should record the inventory time, remote and `main` commit
  used for reachability checks, each candidate's observed tip and eligibility
  evidence, and the reason each ineligible branch was preserved. Do not record
  private project material or full architecture payloads.
- The eligibility check is conjunctive and must be repeated just before each
  remote deletion. A change in pull-request or lease state, a failed API read,
  a changed tip, or a changed `main` invalidates the earlier dry-run result for
  that branch. A matching re-read is not a substitute for conditional deletion:
  if the ref changes between the re-read and the deletion, the delete must
  fail without removing the new tip. Record that failure and preserve the
  branch for a new review.
- A local worktree removal must stop if Git reports uncommitted changes or if
  the worktree's owner is not the current session. Never use recursive
  filesystem deletion as a cleanup fallback.
- Any follow-up automation requires a separate implementation review,
  synthetic tests for ambiguous and changing state, and explicit verification
  that it is disabled until its acceptance criteria are met.

## References

- [ADR-0005: Coordinate concurrent agent development with expiring issue
  claims](0005-concurrent-agent-development.md).
- [Issue contribution guide](../contributing/issues.md).
- [Manual shared-account agent coordination
  runbook](../contributing/agent-coordination.md).
- Git `branch` reference: https://git-scm.com/docs/git-branch.
- Git `worktree` reference: https://git-scm.com/docs/git-worktree.
- GitHub documentation on
  [deleting and restoring branches in a pull request](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/deleting-and-restoring-branches-in-a-pull-request).
