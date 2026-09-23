# Testing strategy

This fork needs a staged test strategy because the inherited codebase is not yet lint-clean and has no committed test harness.

## Runtime target

Node.js 24 is the primary CI and development runtime. Node.js 22 is retained as a compatibility lane while dependencies are modernized.

Node.js 20 is intentionally not part of the forward CI baseline.

## Recommended stack

| Layer | Tooling | Why |
|---|---|---|
| Smoke / contract tests | Node built-in `node:assert` | Lowest dependency cost; fast CI feedback. |
| Compile tests | Webpack Node API | Matches the browser-library shape without requiring a full app. |
| Unit tests | Vitest | Best fit for modern JavaScript modules once source seams are clearer. |
| Browser component tests | Playwright | More maintained than the currently pinned Puppeteer and better for deterministic screenshots. |
| BDD acceptance tests | Gherkin feature files + Playwright step tests | Best used for user-visible import, render, export, and report workflows. |

## Sequence

1. Keep smoke tests tiny until install and compile are reliable on Node.js 24 and 22.
2. Add TDD unit tests around pure metamodel, relationship, import/export, and SVG rendering logic.
3. Add browser tests only after deterministic fixtures exist.
4. Add BDD scenarios for report-facing behavior:
   - import a model;
   - select a view;
   - render the same diagram in HTML and SVG;
   - embed the SVG in Markdown-rendered report images.

## Current known debt

- `npm run lint` currently fails on the inherited codebase and should be treated as a dedicated cleanup workstream.
- There is no lockfile because `.npmrc` disables `package-lock`.
- Browser automation should be modernized before relying on image-diff tests.
- Dependency modernization should prefer packages that support maintained Node.js lines.
