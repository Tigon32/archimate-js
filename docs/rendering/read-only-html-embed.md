# Read-only HTML embed example

The repository example renders only the hand-authored, provenance-documented
synthetic MEFF fixture at
`test/fixtures/synthetic/read-only-showcase-outline-meff.xml`. The diagram and
outline both use this one model source.
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
The viewer bundle is generated at `.ci-build/archimate-js.js`, the model DTO
browser API at `.ci-build/model-dto.js`, and the migrated viewer module as local
JavaScript alongside the page. These are build outputs and are not
committed. Do not open `index.html` as a `file:` URL because browsers block its
local fixture fetch.

The example links the scoped local app shell stylesheet for its navigation link
and loading/success/error status. It uses the bundled IBM Plex font without a
remote font service. To check the dark controls theme, set `data-theme="dark"`
on the example's `.am-app` root; this changes UI variables only and leaves the
ArchiMate SVG colors intact.

The example presents a non-interactive view-only diagram; it provides no editing
controls or save operation. Its CSS `pointer-events: none` is demo-level
non-interactivity only, not an authorization or security boundary. The fixture
loader uses only a same-origin local URL, rejects an oversized declared length,
and incrementally cancels reads that exceed the byte cap. It shows a generic
failure message without logging or rendering parser errors or model contents.
This is a demonstration boundary, not a substitute for application-level
authorization or content security policy.

The selected view is also rendered as a text outline. It uses nested HTML lists
and native disclosure controls for groups; browser and assistive-technology list
navigation remain available without a custom ARIA tree widget. Names and
relationship descriptions are inserted as text. Documentation is omitted by
the DTO outline defaults. The browser example uses one supported SYNTHETIC MEFF
model for both the diagram renderer and DTO outline, so their concept IDs, names,
relationships, and view references cannot drift independently. A focused test
passes the same fetched XML to both browser APIs and verifies that both can load
the selected view. The DTO importer still supports a MEFF subset; unsupported
formats show a generic outline-unavailable status. Broader legacy model
projection remains tracked under issue #104.

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

## Packaged standalone artifact offline gate

`npm run test:browser` ends with `node test/browser/standalone-network.mts`, an
end-to-end gate for the artifact that the distribution path actually ships. The
gate packs the repository with `npm pack --ignore-scripts`, reads the archive
with the existing packed-asset reader, and serves **only** the packed files. A
development file that is not published cannot make this gate pass.

The standalone page is assembled from packaged resources alone and loads the
`SYNTHETIC` fixture `test/fixtures/synthetic/minimal-application-view.xml` from
the host application's local model path. Required resources, all resolved from
the package, are:

- `dist/browser/archimate-js.js` (viewer script; notation symbols are inlined in
  the bundle, so symbols never require a network request);
- `assets/design-tokens/app-shell.css` and its imported
  `assets/design-tokens/app.generated.css`;
- `assets/ibm-plex-font/IBMPlexSans-Regular.ttf` and
  `assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf`;
- `archimate-font/lib/css/archimate-font.css` and
  `archimate-font/lib/font/archimate-font.woff2`.

### Allowed origins and paths

The allowlist is deterministic and closed. The only approved origin is the
gate's loopback server, and within it only these paths are allowed:

| Path | Purpose |
| --- | --- |
| `/` | the generated standalone page |
| `/package/**` | files read from the packed archive |
| `/model/standalone-view.xml` | the local synthetic model/view resource |
| `/probe/redirect` | negative probe that returns a redirect to an unapproved origin |

Any other origin or path is aborted and recorded. The gate fails on unexpected
external requests, requests to undocumented local paths, missing assets (`4xx`),
redirects (`3xx`), failed local requests, and page or console runtime errors. It
then verifies that the packaged bundle rendered the expected synthetic view
nodes and connection, injected ArchiMate notation symbols with no external
`use`/`image` references, and that both packaged font families are available.

After those checks it runs three negative probes so a silently broken detector
cannot pass: an external fetch must be blocked, a missing packaged asset must
return `404`, and a redirect to an unapproved origin must be blocked and
recorded.

### Environment limitations

- The gate needs the compiled distribution; run it through `npm run test:browser`
  (or `npm run compile:browser`) so `dist/browser/archimate-js.js` exists.
- It uses the repository's configured browser through `CHROME_BIN`, falling back
  to the bundled Playwright Chromium resolution used by the other browser tests.
  Without a usable Chromium the gate fails rather than skipping.
- `npm pack` runs with `--ignore-scripts`, so the gate checks packaging, not the
  `prepack` compile chain; packed asset provenance stays with the release checks.
- Font rasterization still depends on the host environment; the gate asserts font
  availability and resource resolution, not glyph rendering.
- The gate logs only path names and generic messages. It never logs model XML,
  request payloads, or private paths.

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
