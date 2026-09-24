# Single-view CLI export

The `archimate-js export` command creates SVG, PNG, and PDF artifacts for one
selected view. It uses the existing browser renderer and `playwright-core`.
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

Use exactly one of `--view-id` and `--view-name`. At least one `--format` is
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

## Phase 1 API boundary

Phase 1 keeps multi-format export inside the CLI. Browser consumers continue to
use the named `renderViewToSvg` API, which is the canonical single-view render
operation. Adding a second programmatic orchestration API now would establish
Node/browser ownership and option contracts while the typed editor and view DTO
boundary in #94 is still being defined. A later phase can expose that API
without changing the Phase 1 command or adding another rendering engine.

The existing `render` command remains supported and keeps its original syntax:

```sh
archimate-js render ./model.xml \
  --view-id view-id \
  --output ./view.svg
```
