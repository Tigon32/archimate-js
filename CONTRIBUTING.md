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

`npm run verify:wip` is the fast durability gate used by the versioned `.githooks/pre-push` hook. It runs source policy, lint, type checks, and the validator build so WIP can be pushed frequently without waiting for the complete suite. `npm run verify:local` is the full qualification gate: source policy, lint, the complete test suite, and compile, serially and fail-fast. If hooks were intentionally cleared, restore them with `npm run hooks:install`.

Create a Draft PR early and push the WIP branch after each coherent checkpoint, before a risky refactor or long-running operation, and before handoff. Prefer additive checkpoint commits and squash at merge rather than keeping substantial recoverable work only in one agent workspace. Draft pushes are collaboration and recovery snapshots; they are not evidence that the change is ready to merge.

Do not use `git push --no-verify` to make agent-generated work appear qualified. Before changing a Draft PR to Ready for review, run `npm run verify:local`. GitHub Actions remains the independent merge/security boundary and the expensive PR workflows activate at the review-ready transition.

For unattended queue draining, repository maintainers should enable GitHub **Settings → General → Pull Requests → Allow auto-merge**. Once the exact current `HEAD` passes the full local gate, mark the Draft PR Ready and enable auto-merge on that PR. Remote required checks then decide whether it merges; a failed check leaves the PR open for repair rather than requiring a manual merge after success.

## Priority order

1. Remove sensitive logging and silent partial-import behavior.
2. Add reproducible install, CI, and test foundations.
3. Establish ArchiMate semantic and exchange-format tests.
4. Add deterministic SVG export suitable for HTML reports and Markdown-rendered images.
5. Modernize dependencies after characterization tests exist.
