# Contributing

This project aims to make `archimate-js` operational as a standards-grounded, embeddable ArchiMate diagram library for browser use, deterministic SVG output, and report generation.

## Contribution rules

- Keep changes small and reviewable.
- Add or update tests for behavior changes.
- Follow the [issue contribution guide](docs/contributing/issues.md) when opening an issue.
- Follow the [manual agent coordination runbook](docs/contributing/agent-coordination.md) when coordinating work under a shared account.
- Use those guides for umbrella/child scope, lease ownership, and PR recovery; keep this file as the concise entry point.
- Prefer public standards and public repositories as references.
- Add research claims to `docs/research/` with source, date, license constraints, and confidence.
- Add ADRs for consequential architectural decisions.
- Do not add private model exports, customer examples, internal screenshots, private issue text, or private documentation.
- Use synthetic fixtures unless a public fixture has explicit redistribution permission.

## Definition of done

A change is not operationally complete until its relevant checks are defined and passing. Install dependencies once, which also installs the repository-owned Git hooks, then use the canonical local qualification gate:

```bash
npm ci
npm run verify:local
npm pack --dry-run
```

`npm run verify:wip` is the fast durability gate used by `.githooks/pre-push`. After each commit, `.githooks/post-commit` starts the full suite in a detached, single-flight background process and returns immediately. Inspect it with `npm run verify:local:status`. `npm run verify:local` reuses only a clean exact-HEAD receipt; if none matches, it waits for a matching run or executes the complete canonical suite synchronously. `npm run verify:local:run` is that canonical suite. State and receipts stay under the worktree's Git metadata and are not published. If hooks were intentionally cleared, restore them with `npm run hooks:install`.

Create a Draft PR early and push the WIP branch after each coherent checkpoint, before a risky refactor or long-running operation, and before handoff. Prefer additive checkpoint commits and squash at merge rather than keeping substantial recoverable work only in one agent workspace. Draft pushes are collaboration and recovery snapshots; they are not evidence that the change is ready to merge.

Do not use `git push --no-verify` to make agent-generated work appear qualified. Before changing a Draft PR to Ready for review, run `npm run verify:local`. GitHub Actions remains the independent merge/security boundary and the expensive PR workflows activate at the review-ready transition.

For agent-owned branches, use `npm run pr:finalize` as the terminal step instead of manually parking a PR. It runs `verify:local`, pushes exact `HEAD`, verifies that the remote PR points at the same commit, and marks the PR Ready. Ready agent PRs require appropriate independent human review and are not eligible for automatic draining under ADR-0005. The trusted drain may automatically merge only allow-listed grouped Dependabot minor/patch PRs after their exact-head workflows pass. Dependabot eligibility requires the `dependabot[bot]` author, a same-repository branch, and an explicit grouped minor/patch identity configured in `.github/dependabot.yml`. Major, ungrouped, forked, or otherwise unknown dependency updates remain open for review. Do not re-enable automatic draining for agent PRs until branch protections enforce independent approval at merge time and the drain policy and tests are updated together. The `no-auto-merge` label remains an emergency opt-out for otherwise eligible bot PRs.

If the local executor cannot run the full suite, a maintainer/agent may use an explicit remote-fallback promotion only when the authoritative CI runs the same canonical `npm run verify:local` command for the exact HEAD. That fallback spends remote CI deliberately; it must not become the routine edit/debug loop.

Remote verification is also cost-ordered. Node 24 owns the single full qualification run. Node 22 runs only compatibility-sensitive package/CLI checks after the primary gate passes. Browser-only CLI/performance evidence is collected in the Node 24 primary job instead of a duplicate browser job. macOS is not a default PR lane: its path-safety regression runs only when relevant CLI/path files change, plus a weekly drift check.

## Priority order

1. Remove sensitive logging and silent partial-import behavior.
2. Add reproducible install, CI, and test foundations.
3. Establish ArchiMate semantic and exchange-format tests.
4. Add deterministic SVG export suitable for HTML reports and Markdown-rendered images.
5. Modernize dependencies after characterization tests exist.
