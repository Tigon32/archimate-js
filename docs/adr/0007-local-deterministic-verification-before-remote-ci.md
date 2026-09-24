# ADR-0007: Use local deterministic verification before remote CI escalation

Date: 2026-09-25
Status: Accepted

## Context

Agent-generated changes can create short edit/fail/fix loops. Sending every locally reproducible syntax, lint, type, unit, integration, or compile failure to GitHub Actions adds runner cost and latency, and a remote failure also creates a second agent loop to retrieve and interpret logs.

The repository already has deterministic source-policy, lint, test, compile, browser, security, and packaging checks. GitHub Actions is still needed as an independent trust boundary for merge eligibility, platform differences, security services, official-schema validation, and release evidence. Local Git hooks are intentionally not a security boundary because they can be changed or bypassed by the workspace owner.

This decision composes the reusable principles in Agent Stack's `AGP-deterministic-first@1` and `AGP-capability-cost-routing@1`. A separate upstream candidate, `AGP-tiered-verification-escalation@1`, is being recorded in Agent Stack; this local decision does not depend on that unpublished candidate being promoted.

## Decision

1. The canonical locally reproducible qualification command is `npm run verify:local`. It runs, serially and fail-fast:
   - source migration/size policy;
   - lint;
   - the repository test suite, including unit and integration/browser checks already included by `npm test`;
   - compilation of the public entry points.
2. The repository owns a versioned `.githooks/pre-push` hook that invokes `npm run verify:local`. `npm ci` runs a dependency-free `prepare` installer that configures the checkout-local `core.hooksPath=.githooks`; `npm run hooks:install` is the explicit repair command.
3. Agent-generated work must not use `git push --no-verify` to bypass the gate. A bypass can still be performed by a repository owner because Git hooks are client-side; it is an exception, not evidence that the change passed local qualification.
4. GitHub Actions remains authoritative for the review/merge boundary. Normal PR CI, automated security analysis, and path-scoped MEFF XSD validation do not run for Draft PRs. They run when a PR is non-draft, including the `ready_for_review` transition. CI on `main`, scheduled security analysis, manual dispatches, and tag/release workflows remain unchanged.
5. Checks whose value depends on an independent or remote environment stay remote even when a partial local analogue exists. Current examples include the Node 22/24 matrix, macOS path behavior, CodeQL/dependency review, official MEFF XSD retrieval/validation, retained CI artifacts, and release attestation.
6. The local gate and remote gate may overlap intentionally. The local copy exists to reject cheap reproducible failures before escalation; the remote copy establishes independent evidence on a controlled runner.
7. Do not claim a fixed percentage of failures caught locally without measurements. Track local-gate failures, remote failures that were locally reproducible, Actions consumption, and repeated push/CI cycles when the data is available.

## Consequences

- Most deterministic defects should be discovered in the agent/contributor workspace before consuming GitHub-hosted runners.
- Failure feedback is immediate and does not require a second remote-log retrieval loop.
- A full pre-push gate increases local push latency; that is deliberate backpressure. The serial ordering stops after the first failing stage.
- Draft PRs become the low-cost coordination surface. Marking a PR ready for review is the escalation event that activates the normal remote verification boundary.
- The local hook is not tamper-proof. Branch protection and required GitHub checks remain necessary because a client can alter hooks or use Git's native bypass.
- Remote-only platform, security, standards, and release checks continue to consume CI because reproducing them locally would either weaken trust or increase local setup cost.

## Rollback

Remove the `prepare`/hook installer and `.githooks/pre-push`, restore unconditional PR workflow execution, and retain `npm run verify:local` as an optional manual command. Remote CI remains sufficient to protect merge correctness during rollback.

## Revisit conditions

Revisit this decision if local qualification becomes materially slower than the edit cycle, browser/system dependencies make it unreliable across supported contributor environments, draft gating causes required checks to be missed on review-ready PRs, or measurement shows that remote failures are predominantly not locally reproducible. Split the local gate into explicitly ordered tiers rather than silently deleting verification if latency becomes excessive.

## References

- Implementation task: https://github.com/Tigon32/archimate-js/issues/212
- Agent Stack deterministic-first pattern: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-deterministic-first.md
- Agent Stack capability-cost routing pattern: https://github.com/Tigon32/agent-stack/blob/main/governance/patterns/AGP-capability-cost-routing%401.md
- Git hooks: https://git-scm.com/docs/githooks
- Git `core.hooksPath`: https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath
- GitHub pull request draft state: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-pull-requests/changing-the-stage-of-a-pull-request
- GitHub Actions pull_request activity types: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request
