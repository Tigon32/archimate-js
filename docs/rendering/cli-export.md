# CLI export

The `archimate-js export` command creates SVG, PNG, and PDF artifacts for one
selected view or every supported diagram view. It uses the existing browser renderer and `playwright-core`.
The package does not download a browser; provide an installed Chrome or
Chromium through `CHROME_BIN` or `--chrome`.

```sh
archimate-js export ./model.xml \
  --view-name "Application landscape" \
  --format svg,png,pdf \
  --output-dir ./exports \
  --basename application-landscape \
  --scale 2 \
  --background '#ffffff' \
  --pdf-page-size A4 \
  --pdf-orientation landscape
```

Use exactly one of `--view-id`, `--view-name`, and `--all-views`. At least one `--format` is
required; formats may be comma-separated or supplied through repeated
`--format` options. Duplicate and unknown formats are rejected.

| Option | Values and default |
| --- | --- |
| `--output-dir` | Required output directory. It is created when necessary. |
| `--basename` | Optional file basename; default `view`. Unsafe characters are replaced with `-`, combining marks are removed, and the result is limited to 80 characters. |
| `--scale` | Integer `1` through `4`; default `1`. It controls PNG device scale. |
| `--background` | `transparent`, `white`, `black`, or `#RRGGBB`; default `white`. PDF rejects `transparent`. |
| `--pdf-page-size` | `A3`, `A4`, `A5`, `Legal`, or `Letter`; default `A4`. |
| `--pdf-orientation` | `portrait` or `landscape`; default `portrait`. |

For all views, omit `--basename` and select `--all-views`:

```sh
archimate-js export ./model.xml --all-views --format svg,png,pdf --output-dir ./exports
```

The command validates XML before browser launch, enumerates supported Diagram views from
the existing legacy or MEFF diagrams container, rejects duplicate or empty view IDs,
and sorts them by ID. It uses one Chrome/Chromium process, one blocked-network
context, and one renderer page for the batch. View names become sanitized basenames
with deterministic ID-based suffixes for collisions, including collisions after
case folding. Each basename is at most 80 characters. Names cannot escape the
output directory. An empty or unrepresentable name falls back to `view`.

`manifest.json` has schema version `1` and entries in view-ID order. Each entry
contains `viewId`, `viewName`, `diagnostics` (empty on success), and `outputs` in
requested format order. An output contains `format`, relative `path`, canonical
SVG `dimensions` (`width` and `height` in diagram units), and SHA-256 of the
published bytes. SVG bytes and hashes are stable for identical input/options;
raster/PDF hashes describe the actual files, and browser-version or PDF metadata
can affect their bytes. The manifest is local and intentionally contains model
view identifiers and names; public CLI diagnostics contain neither.

The default batch policy is fail-fast. All views render before publication; on
render failure no files are published. Files are written atomically and the
manifest is written last. On a publication failure, new files are removed and
pre-existing files, including the manifest, are restored. Existing symlinked
output directory components and output targets are rejected. Output directory
paths must not be changed concurrently by another process during publication.
Partial-success / continue-on-error behavior is outside this command's current
contract.

The command validates the model before starting Chrome. It opens one browser
context, blocks every network route, renders the selected view once, and
derives all requested formats from that SVG in the same page. Outputs are
written atomically. If generation or publication fails, the request reports
failure and removes new files or restores files that existed before the
request.

Diagnostics are structured JSON with deterministic exit codes:

- `0`: validation and all requested outputs succeeded.
- `1`: input, validation, browser, rendering, or output failure.
- `2`: invalid command options.

Diagnostics do not contain model XML, local paths, view identifiers, parser or
browser exception text, or stack traces. A successful response reports the
requested formats but not output paths.

## Programmatic API boundary

Multi-format export remains inside the CLI. Browser consumers continue to
use the named `renderViewToSvg` API, which is the canonical single-view render
operation. A separate issue defines the Node/browser ownership and option
contracts for a future programmatic multi-format API.

The existing `render` command remains supported and keeps its original syntax:

```sh
archimate-js render ./model.xml \
  --view-id view-id \
  --output ./view.svg
```
