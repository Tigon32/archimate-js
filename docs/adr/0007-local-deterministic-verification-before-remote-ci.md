# ADR-0007: Use tiered local verification before remote CI escalation

Date: 2026-09-25
Status: Accepted

## Context

Agent-generated changes create short edit/fail/fix loops, but they also need durable remote checkpoints. Sending every locally reproducible syntax, lint, type, unit, integration, or compile failure to GitHub Actions adds runner cost and latency. Conversely, keeping substantial WIP only in an ephemeral agent workspace harms collaboration and can lose work when a process, machine, or agent session fails.

The repository already has deterministic source-policy, lint, test, compile, browser, security, and packaging checks. GitHub Actions is still needed as an independent trust boundary for merge eligibility, platform differences, security services, official-schema validation, and release evidence. Local Git hooks are intentionally not a security boundary because they can be changed or bypassed by the workspace owner.

This decision composes Agent Stack's existing `AGP-deterministic-first@1`, `AGP-capability-cost-routing@1`, `AGP-engineering-gauntlet@1`, and `AGP-artifact-gated-lifecycle@1`. Agent Stack records this project as a `COMPOSITION_RECIPE`; no new shared AGP identity is claimed by this decision.

## Decision

1. Local verification has explicit cost tiers:
   - commit-time checks, if configured, must remain ultra-cheap and operate only on staged/changed content; heavy suites must not synchronously block ordinary commits;
   - `npm run verify:wip` is the fast durability gate. It runs source migration/size policy, lint, type checking, and validator build checks before WIP push;
   - `npm run verify:local` is the full qualification gate. It runs source policy, lint, the complete repository test suite, and compilation serially and fail-fast.
2. The repository owns a versioned `.githooks/pre-push` hook that invokes `npm run verify:wip`. `npm ci` runs a dependency-free `prepare` installer that configures checkout-local `core.hooksPath=.githooks`; `npm run hooks:install` is the explicit repair command.
3. Contributors and agents create a Draft PR early and push the WIP branch frequently at coherent checkpoints, before risky refactors or long-running work, and before handoff. These pushes are durable collaboration/recovery snapshots, not merge qualification. Prefer additive checkpoint commits; squash at merge rather than rewriting shared WIP history.
4. Heavy deterministic verification may run speculatively in the background after commits to reduce later qualification latency, but background work is advisory until it completes. Such verification must be single-flight per workspace/branch: when a newer commit supersedes the subject, cancel the obsolete run rather than allowing stale suites to compete for compute.
5. A completed background verification result is reusable only when its receipt is bound to the exact current subject and relevant environment identity, including at minimum the commit SHA, verification profile, supported runtime/toolchain identity, and dependency/lock state where those can change the result. A stale or mismatched receipt does not qualify a newer commit.
6. Before changing a Draft PR to Ready for review, require a successful `verify:local` result for the exact current `HEAD`. A matching completed receipt may satisfy that requirement; otherwise run `npm run verify:local` synchronously. Agent-generated work must not use `git push --no-verify` to make an unverified snapshot appear qualified. A repository owner can still bypass a client-side hook; bypass is an exception, not evidence.
7. GitHub Actions remains authoritative for the review/merge boundary. Normal PR CI, automated security analysis, and path-scoped MEFF XSD validation do not run for Draft PRs. They run when a PR is non-draft, including the `ready_for_review` transition. CI on `main`, scheduled security analysis, manual dispatches, and tag/release workflows remain unchanged.
8. Draft is a temporary collaboration state, not a terminal queue. At successful task completion an agent SHOULD run the repository-owned `npm run pr:finalize` command, which requires a clean `agent/*` branch, runs the full local gate, pushes exact HEAD, verifies the PR points at that commit, and marks the PR Ready.
9. Queue draining is repository-owned and opt-out, not armed per PR. A trusted workflow on `main` reacts to completed pull-request workflows, considers Ready same-repository `agent/*` PRs plus explicitly allow-listed grouped Dependabot minor/patch version/security PRs, binds its decision to exact HEAD, requires `CI` and `Automated security analysis` to succeed, rejects any failed exact-HEAD PR workflow, and squash-merges with the expected HEAD SHA. For Dependabot, eligibility additionally requires the actual `dependabot[bot]` author and an allow-listed group branch; major, ungrouped, and unknown dependency updates remain manual. The `no-auto-merge` label is the explicit emergency brake. The workflow never checks out PR code with its write-capable token.
10. Built-in GitHub per-PR auto-merge is not required by this profile. If local qualification cannot run in a particular executor, an explicit remote-fallback promotion is permitted only when authoritative CI executes the same canonical `verify:local` command for exact HEAD; this is a deliberate cost escalation, not the normal debugging loop.
11. Checks whose value depends on an independent or remote environment stay remote. Current examples include the Node 22/24 matrix, macOS path behavior, CodeQL/dependency review, official MEFF XSD retrieval/validation, retained CI artifacts, and release attestation. Dependabot-triggered pull-request workflows run with GitHub's restricted read-only token model; CodeQL still performs analysis but suppresses result upload for that PR event, while dependency review and the remaining read-only gates still determine drain eligibility. Normal main/scheduled CodeQL runs retain upload.
12. Local and remote gates may overlap intentionally. The local tiers reject cheap reproducible defects and protect WIP durability; the remote tier establishes independent evidence on controlled runners.
13. Do not claim a fixed percentage of failures caught locally without measurements. Track WIP-gate failures, full-local failures, cancelled superseded background runs, reusable exact-HEAD verification receipts, remote failures that were locally reproducible, Actions consumption, and repeated push/CI cycles when the data is available.

## Consequences

- WIP is recoverable remotely and visible to collaborators without activating the expensive CI boundary.
- Commits remain cheap recovery checkpoints rather than synchronization points for heavy suites.
- The fast pre-push gate provides backpressure against trivial defects without making every durability checkpoint wait for browser/integration suites.
- Optional background verification can hide qualification latency, but it cannot silently become a gate; obsolete runs are cancelled and only exact-subject receipts are reusable.
- Full deterministic qualification moves to the Draft → Ready transition. Bypassing that transition discipline can still waste remote CI, so repository instructions and branch protection remain part of the control.
- Draft PRs are the normal collaboration surface; Ready means the author/agent claims the full local qualification gate has passed and requests authoritative remote verification.
- A green Ready `agent/*` PR drains automatically through a trusted main-branch workflow; successful work does not accumulate in a manual merge queue.
- The drain policy is default-on for the reserved agent branch namespace and for explicitly allow-listed grouped Dependabot minor/patch lanes; it is default-off for human branches, forks, majors, ungrouped/unknown dependency updates, with `no-auto-merge` as an explicit stop control.
- The local hook is not tamper-proof. Branch protection and required GitHub checks remain necessary because a client can alter hooks or use Git's native bypass.
- Remote-only platform, security, standards, and release checks continue to consume CI because reproducing them locally would either weaken trust or increase local setup cost.

## Rollback

Remove the `prepare`/hook installer and `.githooks/pre-push`, restore unconditional PR workflow execution, and retain `verify:wip`/`verify:local` as optional manual commands. Remote CI remains sufficient to protect merge correctness during rollback.

## Revisit conditions

Revisit if commit-time checks become noticeable, WIP pushes are still too slow, locally recoverable work is routinely left unpushed, background verification consumes material compute without reuse, cancellation fails to prevent stale concurrent suites, draft gating causes required checks to be missed on review-ready PRs, or measurements show that remote failures are predominantly not locally reproducible. Adjust the tier contents based on measured cost and defect-capture value rather than silently deleting verification.

## References

- Implementation task: https://github.com/Tigon32/archimate-js/issues/212
- Single-flight background verifier follow-up: https://github.com/Tigon32/archimate-js/issues/214
- Agent Stack deterministic-first pattern: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-deterministic-first.md
- Agent Stack capability-cost routing pattern: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-capability-cost-routing%401.md
- Agent Stack engineering gauntlet: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-engineering-gauntlet.md
- Agent Stack artifact-gated lifecycle: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-artifact-gated-lifecycle.md
- Git hooks: https://git-scm.com/docs/githooks
- Git `core.hooksPath`: https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath
- GitHub pull request draft state: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-pull-requests/changing-the-stage-of-a-pull-request
- GitHub Actions pull_request activity types: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request
