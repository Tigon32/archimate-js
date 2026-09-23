# Contributing

This project aims to make `archimate-js` operational as a standards-grounded, embeddable ArchiMate diagram library for browser use, deterministic SVG output, and report generation.

## Contribution rules

- Keep changes small and reviewable.
- Add or update tests for behavior changes.
- Prefer public standards and public repositories as references.
- Add research claims to `docs/research/` with source, date, license constraints, and confidence.
- Add ADRs for consequential architectural decisions.
- Do not add private model exports, customer examples, internal screenshots, private issue text, or private documentation.
- Use synthetic fixtures unless a public fixture has explicit redistribution permission.

## Definition of done

A change is not operationally complete until its relevant checks are defined and passing. The target gate is:

```bash
npm ci
npm run lint
npm test
npm run build
npm pack
```

The current fork does not yet satisfy this gate. Closing that gap is part of the roadmap.

## Priority order

1. Remove sensitive logging and silent partial-import behavior.
2. Add reproducible install, CI, and test foundations.
3. Establish ArchiMate semantic and exchange-format tests.
4. Add deterministic SVG export suitable for HTML reports and Markdown-rendered images.
5. Modernize dependencies after characterization tests exist.
