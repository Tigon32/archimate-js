# Synthetic performance budgets

The performance gate uses deterministic, generated `SYNTHETIC` models. It does
not load customer, organization, or imported architecture data. The same
generator supplies the Node benchmark and the browser MEFF fixture.

## Tiers

| Tier | Elements/nodes | Relationships/connections | Purpose |
| --- | ---: | ---: | --- |
| Small | 25 | 24 | Fast regression signal |
| Medium | 64 | 63 | Routine scaling signal |
| Large | 144 | 143 | Bounded CI stress signal |

Each model is a fixed grid of application processes joined by triggering
relationships. Identifiers, labels, coordinates, XML, and fixture
fingerprints are deterministic. The benchmark exercises the existing
validator, router, layout, model importer, and SVG renderer. It does not add or
measure culling, workers, alternate rendering paths, or performance
optimizations.

## Commands

Run the deterministic contract tests:

```bash
npm run test:performance:determinism
```

Run the Node and browser smoke gate:

```bash
CHROME_BIN=/path/to/chromium npm run test:performance:smoke
```

The individual commands are `npm run test:performance:node` and
`npm run test:performance:browser`. Both execute every tier with three repeats.
The Node benchmark can use five repeats for a fuller local sample:

```bash
npm run compile:validator
node test/performance/benchmark.mts --assert --repeats=5 \
  --output=test-results/performance-node.json
```

## Statistics and gate behavior

Every measurement records all samples, the median, median absolute deviation
(MAD), and a tolerance:

```text
tolerance = max(1 ms, median * 25%, MAD * 3)
```

Numeric budgets and hard limits are separate constants in
`test/performance/performance-contract.mts`.

- A median above its budget is recorded as `budgetStatus: "exceeded"`. This is
  advisory evidence for investigation and does not fail CI.
- A result fails only when `median - tolerance` is above the hard limit. This
  requires the stable part of the sample to exceed the safety boundary and
  avoids failing on a single slow shared-runner sample.
- Structural assertions remain hard failures: semantic validation must be
  clean, generated counts must match summaries, every connection must route,
  routing must not intersect nodes, browser structure must be exact, and the
  browser must make no off-origin requests or report page errors.

### Node budgets and hard limits

Values are milliseconds in `budget / hard limit` form.

| Tier | Semantic generation | Validation | Diagram generation | Routing | Layout |
| --- | ---: | ---: | ---: | ---: | ---: |
| Small | 25 / 250 | 100 / 1,000 | 25 / 250 | 100 / 1,500 | 250 / 3,000 |
| Medium | 50 / 500 | 250 / 2,500 | 50 / 500 | 500 / 5,000 | 1,000 / 8,000 |
| Large | 100 / 1,000 | 750 / 5,000 | 100 / 1,000 | 3,000 / 12,000 | 3,000 / 20,000 |

### Browser budgets and hard limits

The browser measurement starts in a document initialization script and ends
after the read-only example reports success with the exact expected SVG shape,
connection, and text counts. Browser launch and context creation are excluded.

| Tier | Budget | Hard limit |
| --- | ---: | ---: |
| Small | 2,000 ms | 8,000 ms |
| Medium | 4,000 ms | 15,000 ms |
| Large | 7,000 ms | 25,000 ms |

## Retained artifacts

CI writes `test-results/performance-node.json` and
`test-results/performance-browser.json` and retains them in the pinned
`primary-qualification-evidence` artifact for 30 days, including failed gate
runs when a result file was produced. Each schema-versioned artifact includes:

- contract and schema versions;
- fixture fingerprints and deterministic structural counts;
- raw samples, median, MAD, tolerance, budget, hard limit, and both statuses;
- Node, browser, operating system, architecture, CPU count, and CI metadata;
- repository, revision, workflow run, and run-attempt metadata when available;
- a comparison key for matching compatible environments.

Compare only artifacts with the same format, contract version, tier
configuration, fixture fingerprint, comparison key, and measurement name.
Budget changes require review of this document and the numeric contract; hard
limits should remain broad safety boundaries rather than expected timings.
