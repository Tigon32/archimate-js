# ADR-0004: TypeScript-first incremental migration and module size

Date: 2026-09-24
Status: Accepted

## Context

The application is predominantly JavaScript, while strict TypeScript currently
covers only `src/validator/**/*.ts`. The browser bundle is produced by Webpack,
so the source language does not constrain delivery as a browser library or a
standalone HTML application. A big-bang conversion would add broad risk and
delay feature work; leaving touched modules in JavaScript would prolong the
mixed-type boundary and create more migration work later.

Large modules also make behavior harder to understand and review. The existing
codebase has first-party modules above 500 lines, so a size rule must be applied
as modules are changed rather than requiring an immediate repository-wide
cleanup.

## Decision

1. TypeScript is the target language for all first-party application and test
   source. Do not add new first-party JavaScript source modules.
2. Whenever an existing first-party `.js` or `.mjs` application or test module
   is touched, migrate that whole module to `.ts` or `.mts` in the same change.
   Update imports and type checks with it. Untouched legacy JavaScript may
   remain during the gradual migration. Generated/vendor files, data fixtures,
   and build/configuration files are outside this rule; document any other
   technical exception and its removal condition in the PR.
3. Keep TypeScript strict. Type-check independently from bundling in CI. At
   dynamic XML, moddle, browser, and third-party boundaries, accept `unknown`,
   validate it, and convert to project-owned types. Avoid `any` except for a
   documented interop limitation.
4. Keep the current Webpack distribution during migration. Continue producing
   the browser library bundle; a standalone HTML build remains a separate
   output target and is compatible with TypeScript.
5. Authored executable source and test modules must remain at or below **500
   nonblank, noncomment physical lines**. Each function or method must remain at
   or below **50 nonblank, noncomment physical lines**. Split responsibilities
   into cohesive modules/helpers when a change would exceed either limit.
   Generated code, vendored files, and non-executable fixture/data files are
   excluded. Do not split code into meaningless fragments solely to meet a
   count; record a narrowly scoped exception with a reason and removal
   condition when a genuine constraint prevents compliance.
6. Apply the limits to new and migrated code immediately. When migrating an
   existing module over 500 lines, split it in the same change so the resulting
   authored modules meet the limit. This is a change-level gate, not a mandate to
   rewrite every untouched module now.

## Consequences

- The migration is incremental by touched module, not a project-wide conversion
  deadline. Touching a JavaScript module costs more initially because the whole
  module must be typed and, when oversized, decomposed.
- Public APIs, importer/domain types, and dynamic parser boundaries are the
  preferred first migration seams. Browser behavior and existing public exports
  remain protected by their contract tests.
- CI must expand strict type-checking to migrated application and test modules.
  Linting or an equivalent check must enforce both LOC limits, with documented
  exceptions reviewed like code changes.
- File size is a review signal, not permission to extract trivial helpers. New
  functions should each express a cohesive operation and be independently
  understandable.
- The TypeScript work follows the phases in
  [`product-independence-and-typescript.md`](../roadmap/product-independence-and-typescript.md).

## References

- Repository TypeScript scope: [`tsconfig.json`](../../tsconfig.json).
- Existing browser bundle: [`test/smoke/compile.mjs`](../../test/smoke/compile.mjs).
- TypeScript with Webpack: https://webpack.js.org/guides/typescript/.
- TypeScript type-checking without emit: https://www.typescriptlang.org/tsconfig/noEmit.html.
