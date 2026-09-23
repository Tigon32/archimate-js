# Read-only HTML embed example

The repository example renders only the hand-authored, provenance-documented
synthetic fixture at `test/fixtures/synthetic/read-only-showcase.xml`.
It uses the package's public API from `index.js`, compiled to a local
UMD bundle by the existing compile smoke script. The demo does not use CDN
assets, remote services, inline model markup, `eval`, or model-derived HTML.

## Run locally

From the repository root, with the project's development dependencies installed:

```sh
npm run compile
python3 -m http.server 8000
```

Then open `http://localhost:8000/examples/read-only/`. Serve from the repository
root so the example can retrieve the checked-in fixture by its same-origin path.
The viewer bundle is generated at `.ci-build/archimate-js.js`; it is build output
and is not committed. Do not open `index.html` as a `file:` URL because browsers
block its local fixture fetch.

The example presents a non-interactive view-only diagram; it provides no editing
controls or save operation. Its CSS `pointer-events: none` is demo-level
non-interactivity only, not an authorization or security boundary. The fixture
loader uses only a same-origin local URL, rejects an oversized declared length,
and incrementally cancels reads that exceed the byte cap. It shows a generic
failure message without logging or rendering parser errors or model contents.
This is a demonstration boundary, not a substitute for application-level
authorization or content security policy.

## Use from a consuming application

Import the public package entrypoint in the consumer's normal bundler and mount
the read-only `Viewer` through `mountViewer`. Select a view by ID or unique name:

```js
import { mountViewer } from 'archimate-js';

const viewer = await mountViewer({
  xml,
  viewId: 'view-id-from-model', // or viewName: 'Unique view name'
  container,
  width: '100%',
  height: 520
});
// Keep the instance for the component lifetime, then call viewer.destroy().
```

Fetch and validate model input according to the consuming application's trust
boundary. Do not interpolate model fields into HTML. Treat import failures as
generic user-facing errors and keep XML, model objects, and parser diagnostics
out of logs unless a separately reviewed redaction policy permits them.

`mountViewer` exposes a non-editing report viewer with a narrow sizing API. It
does not expose the modeler's editing tools; applications that need editing
must use a separately reviewed modeler integration. The demo's CSS setting
disables pointer input for presentation only and is not access control.
The helper rejects XML strings longer than 5 Mi UTF-16 code units before it
creates a viewer; applications handling untrusted input should apply their own
transport byte limits before decoding the model.

For static report images, `renderViewToSvg({ xml, viewId, title, description })`
returns the canonical accessible SVG string without mounting a visible UI. It
uses browser SVG geometry, so it requires a browser DOM and is not a Node/server
renderer. Derive Markdown image assets from this returned SVG; do not render a
separate diagram for Markdown and HTML. Repeated renders of the same synthetic
input in the same browser environment are checked for byte stability. Font
availability can still affect browser layout across different environments.

## Reporting suspected standards gaps

When imported content appears to violate ArchiMate notation or exchange behavior,
search the [existing project issues](https://github.com/Tigon32/archimate-js/issues)
and report a minimal `PUBLIC` or `SYNTHETIC` reproduction using the
[conformance issue template](../../.github/ISSUE_TEMPLATE/archimate-conformance.yml).
Include the authoritative Open Group reference, expected and actual behavior,
package version, and runtime. Never upload private models, customer data,
screenshots, names, hosts, or credentials. Documented unsupported behavior is a
known limitation unless new evidence changes the boundary; presentation
preferences belong in feature requests. The Open Group is normative, while
other tools can provide interoperability comparisons.
