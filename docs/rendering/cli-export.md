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
  --fit contain \
  --padding 24 \
  --pdf-page-size A4 \
  --pdf-orientation landscape \
  --pdf-title "Application landscape"
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
| `--fit` | `none`, `contain`, or `cover`; default `none` for compatibility. `contain` preserves the complete view inside the target PDF page; `cover` fills the target page and may crop at its edges. PNG uses the padded SVG bounds as its canvas, so both modes preserve the view aspect ratio without stretching. |
| `--padding` | Nonnegative SVG units from `0` through `1024`; default `0`. Applied symmetrically to the canonical SVG bounds before all requested formats are derived. |
| `--pdf-page-size` | `A3`, `A4`, `A5`, `Legal`, or `Letter`; default `A4`. |
| `--pdf-orientation` | `portrait` or `landscape`; default `portrait`. |
| `--pdf-title` | Optional PDF-only report title, escaped as text in the page header; maximum 200 characters. Requires `pdf` in `--format`. |
| `--pdf-footer` | Optional PDF-only report footer, escaped as text in the page footer; maximum 200 characters. Requires `pdf` in `--format`. |
| `--continue-on-error` | Optional with `--all-views` only. Attempts every view in stable ID order and exits `1` if any view fails. |

Export geometry is bounded before browser capture and publication. After scale
and padding, each raster dimension must be at most `32768` pixels and the
pixel area at most `64000000`; invalid, non-finite, or overflowing SVG bounds
are rejected. These limits protect the CLI from unbounded allocations and do
not change the existing default output for ordinary views.

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
For an explicit partial-failure policy, pass `--continue-on-error`. Rendering
continues after an individual view fails; each completed view publishes its
requested formats as a unit. Failed views leave no new or changed artifacts,
including when a later format fails to write. An existing artifact for a failed
view is restored. The local version `2` manifest contains `policy:
"continue-on-error"`, `overallStatus: "success"` or `"partial_failure"`, and
each view's `status` (`success` or `failed`), outputs, and stable diagnostic
codes. A failed view has no outputs. A manifest write failure restores all
artifacts published by this request and leaves the previous manifest intact;
it returns a global output failure instead of partial success. Directory
setup and browser startup failures likewise fail the request before the
partial manifest is published. Existing directory components and targets
must not be symlinks, and output paths must not change concurrently.

For `--all-views`, the service renders views sequentially in one browser
session. SVG is retained internally as the canonical geometry source for the
manifest even when only PNG or PDF was requested; unrequested SVG files are not
published.

The command validates the model before starting Chrome. It opens one browser
context, blocks every network route, renders the selected view once, applies
the shared fit/padding layout, waits for `document.fonts.ready` before raster
or PDF capture, and derives all requested formats from that SVG in the same
page. A font readiness timeout reports `FONT_READY_FAILED`. Outputs are
written atomically. If generation or publication fails, the request reports
failure and removes new files or restores files that existed before the
request.

Diagnostics are structured JSON with deterministic exit codes:

- `0`: validation and all requested outputs succeeded.
- `1`: input, validation, browser, rendering, or output failure.
- `2`: invalid command options.

Diagnostics do not contain model XML, local paths, view identifiers, parser or
browser exception text, or stack traces. A successful response reports the
requested formats but not output paths. PNG and PDF are validated by signature
and bounded geometry; their bytes are not promised to be stable across Chrome
versions. SVG remains the deterministic structural report artifact.
In continue mode, a completed batch with any failed view reports only
`BATCH_PARTIAL_FAILURE` on stdout; the local manifest contains view IDs and
per-view codes. Fail-fast mode has no manifest on render failure. Neither
mode treats a partial batch as successful.

## Programmatic API boundary

The CLI and Node consumers share the versioned `archimate-js/export` service.
It accepts bounded XML and one selected view, uses an existing local
Chrome/Chromium, blocks network access, and can return in-memory artifacts or
publish them atomically. Browser consumers continue to use the named
`renderViewToSvg` API for SVG. DTO-backed editor state and batch export remain
out of this contract; see
[`programmatic-export.md`](programmatic-export.md).

The existing `render` command remains supported and keeps its original syntax:

```sh
archimate-js render ./model.xml \
  --view-id view-id \
  --output ./view.svg
```
