# Recovery and implementation roadmap

This roadmap turns the fork into a usable, standards-grounded ArchiMate diagram component for live browser embedding and deterministic report rendering.

## Weighted roadmap

| Workstream | Weight | Outcome |
|---|---:|---|
| Public boundary and provenance | 20% | Safe public repo, no private-project leakage, recorded sources |
| Runtime and CI recovery | 20% | Reproducible install, working scripts, baseline tests |
| Semantic and exchange correctness | 25% | Valid ArchiMate model handling and explicit import/export diagnostics |
| Deterministic report rendering | 20% | Same model/view produces stable SVG for HTML and Markdown images |
| Editor hardening | 10% | Safer browser editing, undo/redo invariants, stable public API |
| Release maturity | 5% | Package provenance, notices, changelog, prerelease process |

## Phase 0: Public foundation

Status: in progress.

- Establish public-source-only guardrails.
- Record upstream provenance.
- Add ADR and research structure.
- Add security and contribution policy.
- Identify known unsafe logging and test gaps.

Exit criteria:

- Foundation PR merged.
- Public/private data boundary documented.
- Initial ADRs accepted.

## Phase 1: Operational baseline

- Remove full XML/model diagnostic logging.
- Replace missing `test` script with a real minimal test suite.
- [x] Re-enable reproducible installs with a committed lockfile; `npm ci --ignore-scripts` passes.
- Add CI with least-privilege permissions.
- Add package smoke test and synthetic fixture.

Exit criteria:

```bash
npm ci
npm run lint
npm test
npm pack
```

## Phase 2: Standards and interoperability

- Define supported ArchiMate version explicitly.
- Add public-source research records for ArchiMate, Model Exchange File Format, `diagram-js`, Archi, and relevant renderer references.
- Add relationship-validation tests.
- Add import diagnostics for malformed or partially imported models.
- Add Open Group exchange-format compatibility tests where redistribution terms allow.

Exit criteria:

- No silent partial imports.
- Invalid relationships produce deterministic diagnostics.
- Synthetic exchange round trip is tested.

## Phase 3: Deterministic diagram export

- Add API/CLI path from model and view id to SVG.
- Ensure generated SVG is stable across runs.
- Add accessible labels and metadata where feasible.
- Provide HTML embedding example.
- Provide Markdown-image generation path using the same SVG source.

Exit criteria:

- One synthetic view renders identically in HTML and image-generation pipelines.
- Snapshot tests cover SVG structure.

## Phase 4: Editor and API hardening

- Stabilize public exports.
- Add browser smoke tests.
- Add command/undo/redo invariants for edits.
- Add fixture coverage for copy/paste, reconnect, replace, and relationship rules.

## Phase 5: Release readiness

- [x] Add third-party notices and asset provenance.
- [x] Add SBOM/release provenance plan.
- [x] Document stable public exports, deep-import policy, SemVer channels, and release-note template.
- [x] Test the actual `npm pack` archive through a consumer fixture with registry access disabled.
- [x] Add a read-only release gate for lint, full tests, compile, and browser rendering; it does not publish or use secrets.
- [x] Keep stable operational releases blocked until importer/exporter/render and Archi comparison evidence is recorded.
- Publish a prerelease only after CI, tests, and package smoke tests pass.

## Current known gaps

- Import/export can still be partial, and cross-tool exchange/render interoperability evidence is not established; stable operational releases remain blocked.
- The validator implements a conservative subset, not full XSD or ArchiMate conformance; see the standards profiles.
