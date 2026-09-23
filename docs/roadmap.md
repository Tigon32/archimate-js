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
- Re-enable reproducible installs with a committed lockfile.
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

- Add third-party notices and asset provenance.
- Add SBOM/release provenance plan.
- Publish prerelease only after CI, tests, and package smoke tests pass.

## Current known gaps

- `npm run all` references a missing `test` script.
- No committed lockfile.
- CI is not established.
- Import can fail partially without a strong acceptance signal.
- Development logging can expose complete model payloads.
- Exchange-format scope and supported ArchiMate version are not formally declared.
