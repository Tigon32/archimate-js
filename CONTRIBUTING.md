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

`npm run verify:local` runs the source policy, lint, tests, and compile steps serially and stops at the first failure. The versioned `.githooks/pre-push` hook invokes the same command before every push. If hooks were intentionally cleared, restore them with `npm run hooks:install`.

Do not use `git push --no-verify` to make agent-generated work appear qualified. Local hooks are a cheap, bypassable development boundary; GitHub Actions remains the independent merge/security boundary. Keep iterative PRs in Draft while working locally, and mark them ready for review only after the local gate passes so the expensive PR workflows run at the review boundary.

## Priority order

1. Remove sensitive logging and silent partial-import behavior.
2. Add reproducible install, CI, and test foundations.
3. Establish ArchiMate semantic and exchange-format tests.
4. Add deterministic SVG export suitable for HTML reports and Markdown-rendered images.
5. Modernize dependencies after characterization tests exist.
