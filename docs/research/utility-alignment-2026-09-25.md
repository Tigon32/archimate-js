# Utility alignment after diagram-js 15

## Decision

Align the first-party `min-dash` and `min-dom` dependencies with the versions
required by `diagram-js@15.26.0`:

- `min-dash` `^5.1.0`
- `min-dom` `^5.3.0`

Keep `tiny-svg` at `^2.2.2` for now. The version 4 browser experiment retained
the expected bundle API but was not accepted as a behavior-preserving change
until the browser smoke failure is independently explained.

No direct dependency was added for `didi`, `path-intersection`, or
`object-refs`. They are diagram-js internals and are not imported by
first-party source.

## Evidence

The first-party source imports `min-dash` in renderer, importer, modeling,
moddle, and feature modules; `min-dom` in canvas and renderer modules; and
`tiny-svg` in renderer and label-preview modules. No first-party source import
of `didi`, `path-intersection`, or `object-refs` was found. The existing package
contract test already asserts that `object-refs` remains owned by diagram-js.

Before alignment, the lockfile installed:

| Package | Installed copies | Relevant versions |
| --- | ---: | --- |
| `min-dash` | 4 | 3.8.1, 5.1.0 |
| `min-dom` | 3 | 3.2.1, 5.3.0 |
| `tiny-svg` | 2 | 2.2.4, 4.1.4 |
| `didi` | 1 | 11.0.0 |
| `path-intersection` | 1 | 4.2.1 |
| `object-refs` | 1 | 0.4.0 |

After alignment, the lockfile installs two `min-dash` copies, one `min-dom`
copy, and two `tiny-svg` copies. The remaining `min-dash@3.8.1` copy is required
by the legacy `moddle-xml` dependency tree and is not safely removable by this
change.

The accepted two-package alignment decreases the development browser bundle
from `3,936,153` bytes to `3,900,900` bytes, a reduction of `35,253` bytes
(0.9%). The full three-package experiment reached `3,882,444` bytes, but was
not accepted because the browser smoke gate still failed and the behavior
impact of the `tiny-svg` change was not isolated.
Webpack compilation passed in both configurations. The aligned packages expose
the same imported symbols used by this project; the only observed `min-dom` export change is
the event/matches implementation, while the existing source imports
`assignStyle`, `attr`, `classes`, `clear`, `closest`, `delegate`, `query`,
`queryAll`, and `remove`, all retained by version 5.

The public npm metadata for all six packages declares the MIT license. The
aligned packages are maintained in the bpmn.io utility repositories and match
the dependency ranges declared by diagram-js 15.26.0. No license or notice
change is required.

## Validation

The dependency graph, browser compilation, package contract, packed-consumer,
Node compatibility, and repository verification checks are run as part of the
issue validation. The browser smoke test fails at the pre-existing
“import and export named and unnamed connections” stage with the baseline
dependency set as well as with the aligned `min-dash`/`min-dom` set; this issue
does not change browser assertions or claim that failure as fixed.
