# Read-only HTML embed example

The repository example renders only the hand-authored, provenance-documented
synthetic fixture at `test/fixtures/synthetic/minimal-application-view.xml`.
It uses the package's public default export from `index.js`, compiled to a local
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
the default `Viewer` export into an application-owned container:

```js
import Viewer from 'archimate-js';

const viewer = new Viewer({ container, width: '100%', height: 520 });
await viewer.importXML(xml);
```

Fetch and validate model input according to the consuming application's trust
boundary. Do not interpolate model fields into HTML. Treat import failures as
generic user-facing errors and keep XML, model objects, and parser diagnostics
out of logs unless a separately reviewed redaction policy permits them.
