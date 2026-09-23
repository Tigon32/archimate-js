# archimate-js

A browser-based ArchiMate® diagramming library built on the [diagram-js](https://github.com/bpmn-io/diagram-js) engine from [bpmn.io](https://bpmn.io/).

ArchiMate® is a registered trademark of [The Open Group](https://www.opengroup.org/archimate-forum/archimate-overview).

## What is implemented today

The current package entry point exports the default `Viewer` class from [`index.js`](index.js). This is the supported package-level API today.

| Capability | Current implementation | Important boundary |
| --- | --- | --- |
| Import and render | Import XML with `importXML(xml, view?)`; render the first or a selected view. | XML/MEFF support is still being characterized; see the exchange-format status below. |
| Save model | Serialize the currently loaded model with `saveXML()`. | Do not assume complete cross-tool round-trip fidelity yet. |
| Export diagram | Export the currently displayed diagram as accessible, sanitized SVG with `saveSVG()`. | Exports the current rendered view, not a headless or whole-model export. |
| Viewer navigation | Selection, canvas movement, zoom, touch, and keyboard navigation are included in the Viewer modules. | This is a diagram viewer API, not a claim that every editor workflow is exposed. |
| Read-only embedding | A locally served HTML example mounts the public Viewer API and loads a repository-owned synthetic fixture. | The example disables pointer input for presentation only; that is not an authorization or security boundary. |

The source also contains a `Modeler` implementation with editor modules for palette-based creation, connecting, label editing, moving/resizing, copy/paste, alignment, and snapping. It is **not exported from the package root today**, so treat that implementation as internal rather than a stable public API.

See the [read-only HTML example guide](docs/rendering/read-only-html-embed.md) for the local run steps and consumer integration notes.

## Exchange-format status

The repository is testing its XML handling against synthetic inputs, but it does **not** yet claim full ArchiMate Model Exchange File Format (MEFF) conformance or cross-tool portability. The hand-authored MEFF-oriented candidate is not validated against The Open Group XSD. Its current characterization test shows that element entries are not reconstructed and relationships remain generic with unresolved endpoints.

Until those gaps are closed and tested with schema-valid, safe fixtures, treat import/export as incomplete for interchange workflows. See [the exchange-format alignment notes](docs/standards/model-exchange-alignment.md) and [fixture provenance rules](test/fixtures/README.md).

## Model quality tools

There is no built-in ArchiMate model linter, semantic validator, converter pipeline, or repair workflow in this package today. These are separate candidate capabilities and must not be inferred from XML parsing or SVG rendering.

## Development checks

Pull requests and pushes to `main` run CI on Node.js 22 and 24. The checks cover package entry loading, security/logging guards, fixture safety and provenance, unit contracts, and compilation of the public entry point.
