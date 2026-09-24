# Programmatic export contract

`archimate-js/export` is the versioned Node API for exporting one selected
view from bounded ArchiMate XML. `exportView` accepts exactly one `viewId` or
`viewName`, and `formats` may contain `svg`, `png`, and `pdf`. The service
returns in-memory artifacts with dimensions and safe diagnostics; `writeExport`
adds atomic file publication and restores pre-existing files if any output
cannot be published.

`exportViews` accepts multiple independently validated single-view requests
(each request supplies its own bounded XML and one selected view), requires
every normalized request to use the same scale, and renders them sequentially
in one browser session. The CLI uses it for multiple views from the same input
XML. It is fail-fast and does not publish files or provide partial-success
results. Each result contains only requested artifacts plus internal canonical
SVG metadata used by the CLI manifest path; unrequested SVG files are never
published. It is not a DTO/editor-state batch API.

Node export uses an existing local Chrome or Chromium executable selected by
`chrome`, `CHROME_BIN`, or the supported PATH/macOS locations. The package
never downloads a browser and does not promise a particular browser version.
Every browser context blocks all network routes. The renderer bundle must already be built. PNG and PDF therefore require
Playwright plus a usable browser; SVG uses the same browser-backed renderer in
Node. The API does not accept editor DTOs.

`AbortSignal` is checked before launch and before capture. Cancellation is
reported as `EXPORT_ABORTED`; in-flight browser operations are allowed to
finish their cleanup before the promise rejects. Browser, context, page, and
temporary-file cleanup is best effort but always attempted. Export errors are
typed by their stable `error.code` and never include XML, view identifiers,
absolute paths, parser details, browser exception text, or stack traces in
public diagnostics.

Browser-only consumers continue to use `renderViewToSvg` from the root package
for SVG. This Node API is intentionally separate because raster and PDF
capture require Playwright/browser ownership.
