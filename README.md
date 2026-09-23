# archimate-js

A browser-based ArchiMate® diagramming library built on the [diagram-js](https://github.com/bpmn-io/diagram-js) engine from [bpmn.io](https://bpmn.io/).

ArchiMate® is a registered trademark of [The Open Group](https://www.opengroup.org/archimate-forum/archimate-overview).\n\nSee [third-party notices](THIRD_PARTY_NOTICES.md) for bundled font licenses, project provenance, and attribution.

## What is implemented today

The package entry point exports the default `Viewer` class and the named `mountViewer` and `renderViewToSvg` helpers from [`index.js`](index.js). These are the supported read-only viewer and SVG report APIs.

| Capability | Current implementation | Important boundary |
| --- | --- | --- |
| Import and render | Use `Viewer.importXML(xml, view?)` or mount selected views with `mountViewer({ xml, viewId/viewName, container })`. | XML/MEFF support is still being characterized; see the exchange-format status below. |
| Save model | Serialize the currently loaded model with `saveXML()`. | Do not assume complete cross-tool round-trip fidelity yet. |
| Export diagram | Export the current view with `saveSVG()` or render an accessible SVG string with `renderViewToSvg({ xml, viewId/viewName })`. | SVG rendering requires a browser DOM; it is not a Node/server renderer or whole-model export. |
| Viewer navigation | Selection, canvas movement, zoom, touch, and keyboard navigation are included in the Viewer modules. | This is a diagram viewer API, not a claim that every editor workflow is exposed. |
| Read-only embedding | A locally served HTML example mounts the public Viewer API and loads a repository-owned synthetic fixture. | The example disables pointer input for presentation only; that is not an authorization or security boundary. |

The source also contains a `Modeler` implementation with editor modules for palette-based creation, connecting, label editing, moving/resizing, copy/paste, alignment, and snapping. It is **not exported from the package root today**, so treat that implementation as internal rather than a stable public API.

See the [read-only HTML example guide](docs/rendering/read-only-html-embed.md) for consumer integration notes.

## Exchange-format status

The repository is testing its XML handling against synthetic inputs, but it does **not** yet claim full ArchiMate Model Exchange File Format (MEFF) conformance or cross-tool portability. The hand-authored MEFF-oriented candidate is not validated against The Open Group XSD. Its current characterization test shows that element entries are not reconstructed and relationships remain generic with unresolved endpoints.

Until those gaps are closed and tested with schema-valid, safe fixtures, treat import/export as incomplete for interchange workflows. See [the exchange-format alignment notes](docs/standards/model-exchange-alignment.md) and [fixture provenance rules](test/fixtures/README.md).

## Model quality tools

The package exposes an initial TypeScript validator at `archimate-js/validator`. It checks bounded XML input, a conservative model structure subset, references, and relationship vocabulary, then optionally runs caller-supplied organization quality rules. It reports deterministic review suggestions and does not mutate the source. This is not XSD validation, a complete ArchiMate semantic matrix, a conformance claim, or an automatic repair workflow. See [the validator profile](docs/standards/validator-profile.md).

## Run and test locally

Use Node.js 22.12 or later. From the repository root, install dependencies and build the browser bundle:

```sh
npm install
npm run compile
```

In a terminal, start a loopback-only static server from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/examples/read-only/> in your browser. The example loads the checked-in synthetic model fixture and the bundle built at `.ci-build/archimate-js.js`. Keep the server running while you use the page. Do not open the HTML file directly with a `file:` URL; its same-origin model fetch will not work. Binding to `127.0.0.1` keeps this development server off your LAN.

To run the automated checks, use another terminal from the repository root:

```sh
npm test
npm run compile
npm run test:browser
```

The browser smoke test starts its own loopback server and checks the synthetic example in Chrome/Chromium. Install Chrome or Chromium separately and set `CHROME_BIN` to its executable path, for example `CHROME_BIN=/usr/bin/chromium npm run test:browser`. The browser is not downloaded during npm installation.\n\n`--ignore-scripts` skips dependency install-time scripts; compile and test commands do not require those scripts.

## Development checks

Pull requests and pushes to `main` run CI on Node.js 22 and 24, plus a hosted Chrome browser smoke test. The checks cover package entry loading, security/logging guards, fixture safety and provenance, unit contracts, and compilation of the public entry point.
