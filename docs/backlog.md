# Ranked backlog

This backlog was produced from an advisory/adversary council review focused on making the fork operational for embedded ArchiMate diagrams in HTML reports and rendered Markdown images.

> GitHub Issues are currently disabled for this repository, so these items could not yet be created as issues. Once Issues are enabled, convert this file into one issue per backlog item.

## Ranking model

| Factor | Weight |
|---|---:|
| Operational unblock | 30% |
| Report/diagram demand fit | 30% |
| Risk reduction | 25% |
| Frugality/reuse | 15% |

## P0 / 1 — Enable GitHub Issues and backlog handling

### Why

The requested backlog cannot be managed as GitHub issues while repository Issues are disabled.

### Acceptance criteria

- [ ] Repository Issues are enabled.
- [ ] Each ranked backlog item below exists as a GitHub issue.
- [ ] Issue titles preserve the P-rank prefix.
- [ ] Issues include acceptance criteria and weighted value.

## P0 / 2 — Reproducible CI baseline for install, lint, build, and tests

### Why

The package currently advertises npm run all, but the test script was missing. CI must prove the package can be installed, linted, built, and tested before renderer work starts.

### Acceptance criteria

- [ ] GitHub Actions runs on pull requests and pushes to main.
- [ ] CI runs on Node.js LTS.
- [ ] CI installs dependencies non-interactively.
- [ ] CI runs lint, unit tests with coverage, and a build/compile smoke check.
- [ ] npm run all is the single local validation command.

## P0 / 3 — Remove unsafe full XML/model logging

### Why

Imported ArchiMate XML may contain enterprise-sensitive names, relationships, and roadmaps. Logging full XML or parsed model objects is unsafe for a public reusable renderer.

### Acceptance criteria

- [ ] No direct logging of full XML import payloads.
- [ ] No direct logging of full parsed model objects in import flow.
- [ ] Regression test prevents reintroduction.
- [ ] Future diagnostic logging uses safe summaries only.

## P0 / 4 — Define canonical diagram rendering contract

### Why

HTML reports and Markdown-rendered images must come from one canonical diagram source to avoid divergence.

### Acceptance criteria

- [ ] Document model input, view selection, rendering options, output SVG, and diagnostics.
- [ ] Define deterministic output requirements.
- [ ] Define unsupported/partial-render behavior.
- [ ] Include examples for report pipeline consumers.

## P1 / 5 — Add ArchiMate fixture set for TDD

### Why

Renderer confidence needs small public fixtures that cover layers, relationships, nested nodes, labels, and edge cases.

### Acceptance criteria

- [ ] Fixtures are public-safe and synthetic.
- [ ] Fixtures cover at least one element per ArchiMate layer.
- [ ] Fixtures include common relationships and label behavior.
- [ ] Fixtures are small enough for fast CI.

## P1 / 6 — Add deterministic SVG export tests

### Why

The target use case depends on repeatable diagrams in HTML and Markdown images.

### Acceptance criteria

- [ ] Same model/view produces stable SVG across repeated runs.
- [ ] IDs, ordering, dimensions, and viewBox behavior are deterministic or normalized.
- [ ] SVG output can be snapshot-tested without noisy churn.
- [ ] Failure diffs are usable in reviews.

## P1 / 7 — Introduce BDD browser behavior tests

### Why

Embedded live diagrams are browser behavior, not just library code. BDD should validate user-visible outcomes without overbuilding.

### Recommended fit

Use Playwright test specs with Given/When/Then naming first. Defer Cucumber unless non-developers will author scenarios.

### Acceptance criteria

- [ ] Browser test loads a minimal ArchiMate model.
- [ ] Scenario verifies diagram is visible.
- [ ] Scenario verifies SVG export/download path.
- [ ] Scenario verifies rendering errors are surfaced cleanly.

## P1 / 8 — Report integration adapter for HTML and Markdown image generation

### Why

Reports need diagrams where applicable in both HTML and rendered Markdown images.

### Acceptance criteria

- [ ] API accepts model XML and view id/name.
- [ ] API emits embeddable HTML fragment and standalone SVG.
- [ ] Markdown image workflow consumes the same SVG artifact.
- [ ] Manifest records source model, view id, renderer version, and output paths.

## P1 / 9 — Standards-first import/export compatibility

### Why

The fork should remain portable across Archi, Open Group ArchiMate Exchange Format, and future enterprise semantics integrations.

### Acceptance criteria

- [ ] Identify supported ArchiMate Exchange Format subset.
- [ ] Add compatibility fixtures from public-safe examples.
- [ ] Document unsupported constructs.
- [ ] Avoid private or project-specific schema assumptions.

## P2 / 10 — Dependency modernization plan

### Why

The project has older browser build/test dependencies. Modernization should be staged to avoid expensive churn.

### Acceptance criteria

- [ ] Inventory runtime and dev dependencies.
- [ ] Identify security, maintenance, and browser compatibility risks.
- [ ] Define staged upgrade order.
- [ ] Avoid upgrades that do not support report rendering or operational stability.

## P2 / 11 — Coverage ratchet

### Why

Coverage should increase without blocking the first operational baseline.

### Acceptance criteria

- [ ] Initial coverage threshold starts at zero or current measured baseline.
- [ ] Ratchet rule prevents decreases after baseline is established.
- [ ] Unit, integration, and browser coverage are reported separately where useful.
- [ ] Coverage artifacts are retained in CI.

## P2 / 12 — Release/package hygiene

### Why

Other projects will depend on this fork, so packaging must be predictable.

### Acceptance criteria

- [ ] Package metadata points to Tigon32 fork while preserving upstream provenance.
- [ ] Build artifacts and files whitelist are verified.
- [ ] Release process is documented.
- [ ] Versioning policy is explicit for internal/public consumers.
