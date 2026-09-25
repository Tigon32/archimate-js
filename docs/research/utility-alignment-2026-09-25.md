# Utility alignment after diagram-js 15

## Decision

Align the first-party `min-dash` and `min-dom` dependencies with
`diagram-js@15.26.0`:

- `min-dash` `^3.8.0` to `^5.1.0`
- `min-dom` `^3.1.3` to `^5.3.0`

Keep `tiny-svg` at `^2.2.2`. Do not add direct dependencies for `didi`,
`path-intersection`, or `object-refs`; they are diagram-js internals and
first-party source does not import them.

## First-party import inventory

The inventory scans `lib/**/*.js` import declarations.

| Package | Imported symbols |
| --- | --- |
| `min-dash` | `assign`, `every`, `filter`, `find`, `findIndex`, `forEach`, `has`, `isArray`, `isDefined`, `isNumber`, `isObject`, `isString`, `isUndefined`, `keys`, `map`, `matchPattern`, `omit`, `pick`, `reduce`, `some`, `sortBy` |
| `min-dom` | `delegate`, `domify`, `query`, `remove` |
| `tiny-svg` | `append`, `attr`, `classes`, `create`, `innerSVG`, `remove` |

`BaseViewer.js` imports `domify`, `query`, and `remove`; `CanvasCreate.js`
imports `delegate`; `ArchimateRenderer.js` and
`ArchimateReplacePreview.js` import `query`. This corrects the prior
incomplete `min-dom` inventory.

## API and changelog review

The public export lists for `min-dash@3.8.1` and `min-dash@5.1.0` are identical
for every first-party symbol above. `min-dom@3.2.1` and `min-dom@5.3.0` both
export `delegate`, `domify`, `query`, and `remove`.

The reviewed upstream changelogs document the compatibility boundary:

- [`min-dash` v5.0.0](https://github.com/bpmn-io/min-dash/blob/v5.1.0/CHANGELOG.md#500)
  is ESM-only and requires Node 20.12 or later for CommonJS consumers; v4.0.0
  emits ES2018. This package requires Node `>=22.12.0` and consumes the utility
  through webpack/browser ESM, so both requirements are satisfied.
- [`min-dom` v5.0.0](https://github.com/bpmn-io/min-dom/blob/v5.3.0/CHANGELOG.md#500)
  is ESM-only and drops UMD output. Its v4.0.0 boundary requires ES2018 and
  native `Element#matches`; the supported browser build already targets modern
  browsers through webpack. Version 5.3.0 updates `domify` to 3.0.0, but the
  public default `domify` export and the three other imported functions remain
  present.

All six reviewed packages declare MIT licenses in the resolved npm metadata.
No third-party notice changes are required.

## Reproducible measurement

Measurements use Node `v26.8.2`, npm `11.19.1`, macOS, clean detached
worktrees for baseline and accepted alignment, and their committed
`package-lock.json` files. The browser artifact is
`.ci-build/archimate-js.js`; the byte count command is:

```sh
wc -c .ci-build/archimate-js.js
```

| Variant | Exact checkout | Commands | Bytes | Canonical browser result |
| --- | --- | --- | ---: | --- |
| Baseline | `2d502dbd03901d0aa1325713bc173ebfa489e95f` | `npm ci --ignore-scripts && npm run compile:browser && npm run test:browser` | 3,936,153 | pass |
| Accepted alignment | `26ee0c7bdd3460aae58a25e9c0d430411b546e73` | `npm ci --ignore-scripts && npm run compile:browser && npm run test:browser` | 3,900,900 | pass |

The accepted alignment reduces the development browser artifact by 35,253
bytes (0.9%).

`tiny-svg` remains unchanged. Its major-version upgrade was not assessed with
a committed lockfile and retained browser log, so this record makes no
compatibility, bundle-size, or failure claim about version 4. A future update
must be evaluated as a separate, reproducible dependency change rather than
being inferred from this alignment.

`npm run test:browser` is the canonical browser command. It first runs
`compile:model-dto`, `compile:browser`, `compile:model-dto:browser`, and
`compile:read-only-example`, then runs browser smoke, DTO save, theme contrast,
accessible outline, and diagram-js 15 core checks. Invoking
`node test/browser/smoke.mjs` alone is not equivalent because it skips those
prebuilds, including `.ci-build/model-dto.js`.

The captured canonical logs have SHA-256 digests:

| Variant | Log SHA-256 |
| --- | --- |
| Baseline | `e70e45a0c0c9793793ecee48bb567dfcd77b9dff8fa7ef45f7a4c86139841620` |
| Accepted alignment | `424c036a43d3a924a4926f71406aee6ac7db8eb48b57cfadf2b4fe5d6920106f` |
