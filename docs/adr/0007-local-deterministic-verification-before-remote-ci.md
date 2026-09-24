# ADR-0007: Use tiered local verification before remote CI escalation

Date: 2026-09-25
Status: Accepted

## Context

Agent-generated changes create short edit/fail/fix loops, but they also need durable remote checkpoints. Sending every locally reproducible syntax, lint, type, unit, integration, or compile failure to GitHub Actions adds runner cost and latency. Conversely, keeping substantial WIP only in an ephemeral agent workspace harms collaboration and can lose work when a process, machine, or agent session fails.

The repository already has deterministic source-policy, lint, test, compile, browser, security, and packaging checks. GitHub Actions is still needed as an independent trust boundary for merge eligibility, platform differences, security services, official-schema validation, and release evidence. Local Git hooks are intentionally not a security boundary because they can be changed or bypassed by the workspace owner.

This decision composes Agent Stack's existing `AGP-deterministic-first@1`, `AGP-capability-cost-routing@1`, `AGP-engineering-gauntlet@1`, and `AGP-artifact-gated-lifecycle@1`. Agent Stack records this project as a `COMPOSITION_RECIPE`; no new shared AGP identity is claimed by this decision.

## Decision

1. Local verification has two deterministic tiers:
   - `npm run verify:wip` is the fast durability gate. It runs source migration/size policy, lint, type checking, and validator build checks.
   - `npm run verify:local` is the full qualification gate. It runs source policy, lint, the complete repository test suite, and compilation serially and fail-fast.
2. The repository owns a versioned `.githooks/pre-push` hook that invokes `npm run verify:wip`. `npm ci` runs a dependency-free `prepare` installer that configures checkout-local `core.hooksPath=.githooks`; `npm run hooks:install` is the explicit repair command.
3. Contributors and agents create a Draft PR early and push the WIP branch frequently at coherent checkpoints, before risky refactors or long-running work, and before handoff. These pushes are durable collaboration/recovery snapshots, not merge qualification. Prefer additive checkpoint commits; squash at merge rather than rewriting shared WIP history.
4. Before changing a Draft PR to Ready for review, run `npm run verify:local`. Agent-generated work must not use `git push --no-verify` to make an unverified snapshot appear qualified. A repository owner can still bypass a client-side hook; bypass is an exception, not evidence.
5. GitHub Actions remains authoritative for the review/merge boundary. Normal PR CI, automated security analysis, and path-scoped MEFF XSD validation do not run for Draft PRs. They run when a PR is non-draft, including the `ready_for_review` transition. CI on `main`, scheduled security analysis, manual dispatches, and tag/release workflows remain unchanged.
6. Checks whose value depends on an independent or remote environment stay remote. Current examples include the Node 22/24 matrix, macOS path behavior, CodeQL/dependency review, official MEFF XSD retrieval/validation, retained CI artifacts, and release attestation.
7. Local and remote gates may overlap intentionally. The local tiers reject cheap reproducible defects and protect WIP durability; the remote tier establishes independent evidence on controlled runners.
8. Do not claim a fixed percentage of failures caught locally without measurements. Track WIP-gate failures, full-local failures, remote failures that were locally reproducible, Actions consumption, and repeated push/CI cycles when the data is available.

## Consequences

- WIP is recoverable remotely and visible to collaborators without activating the expensive CI boundary.
- The fast pre-push gate provides backpressure against trivial defects without making every durability checkpoint wait for browser/integration suites.
- Full deterministic qualification moves to the Draft → Ready transition. Bypassing that transition discipline can still waste remote CI, so repository instructions and branch protection remain part of the control.
- Draft PRs are the normal collaboration surface; Ready means the author/agent claims the full local qualification gate has passed and requests authoritative remote verification.
- The local hook is not tamper-proof. Branch protection and required GitHub checks remain necessary because a client can alter hooks or use Git's native bypass.
- Remote-only platform, security, standards, and release checks continue to consume CI because reproducing them locally would either weaken trust or increase local setup cost.

## Rollback

Remove the `prepare`/hook installer and `.githooks/pre-push`, restore unconditional PR workflow execution, and retain `verify:wip`/`verify:local` as optional manual commands. Remote CI remains sufficient to protect merge correctness during rollback.

## Revisit conditions

Revisit if WIP pushes are still too slow, locally recoverable work is routinely left unpushed, draft gating causes required checks to be missed on review-ready PRs, or measurements show that remote failures are predominantly not locally reproducible. Adjust the tier contents based on measured cost and defect-capture value rather than silently deleting verification.

## References

- Implementation task: https://github.com/Tigon32/archimate-js/issues/212
- Agent Stack deterministic-first pattern: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-deterministic-first.md
- Agent Stack capability-cost routing pattern: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-capability-cost-routing%401.md
- Agent Stack engineering gauntlet: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-engineering-gauntlet.md
- Agent Stack artifact-gated lifecycle: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-artifact-gated-lifecycle.md
- Git hooks: https://git-scm.com/docs/githooks
- Git `core.hooksPath`: https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath
- GitHub pull request draft state: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-pull-requests/changing-the-stage-of-a-pull-request
- GitHub Actions pull_request activity types: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request
