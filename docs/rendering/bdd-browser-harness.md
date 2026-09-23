# BDD and browser harness

The browser smoke journeys use Playwright Core with the repository's documented
synthetic model only. The job launches the Chrome/Chromium executable supplied
by the runner, so it does not download a browser during dependency installation.
The browser job runs separately from the Node test matrix because launching a
real browser adds runtime and runner requirements.

## Run locally

Install dependencies, build the public browser entry point, then set
`CHROME_BIN` to an installed Chrome or Chromium executable:

```sh
npm install --ignore-scripts
npm run compile
CHROME_BIN="$(command -v google-chrome || command -v chromium || command -v chromium-browser)" npm run test:browser
```

The test serves only an explicit set of local repository routes and aborts
off-origin requests. It checks the read-only HTML embed, deterministic SVG
rendering for the same synthetic view ID, that a Markdown image path refers to
the exact SVG artifact, and that malformed XML returns a static diagnostic
without echoing a synthetic marker to diagnostics or the browser console.

Playwright trace and screenshot files are created only when the smoke test
fails. CI uploads those synthetic-only failure artifacts for seven days; a
successful run leaves no browser artifacts behind. The synthetic fixture and
failure page must never contain private models or architecture details.

## Scope

The journey setup is BDD-shaped but does not add Cucumber: the assertions use
scenario names and externally visible behavior, while Cucumber would add
another runner without improving the current small suite. Cross-browser and
pixel-diff checks remain deferred until they add useful coverage beyond stable
SVG structure and labels.

## Related issues

- #8
- #13
- #14
