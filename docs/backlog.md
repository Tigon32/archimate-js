# Ranked backlog

GitHub Issues are enabled now, but this file remains the durable backlog snapshot for traceability. Each ranked item should also exist as a GitHub issue.

## Runtime baseline

Node.js 24 is the primary target. Node.js 22 is the compatibility lane. Node.js 20 is out of scope for the forward operational baseline.

| Rank | Priority | Title | Primary value |
|---:|---|---|---:|
| 1 | P0 | Enable operational CI and baseline test harness on Node.js 24/22 | 16% |
| 2 | P0 | Remove unsafe full XML/model logging | 13% |
| 3 | P0 | Establish deterministic compile/package contract | 11% |
| 4 | P1 | Build public ArchiMate fixture suite | 10% |
| 5 | P1 | Validate Open Group model exchange import/export | 10% |
| 6 | P1 | Align relationship matrix with ArchiMate standard | 9% |
| 7 | P1 | Create deterministic SVG export API | 9% |
| 8 | P1 | Embed one diagram source in HTML and Markdown image reports | 8% |
| 9 | P2 | Add BDD scenarios for report workflows | 6% |
| 10 | P2 | Modernize lint/dependency/tooling debt | 5% |
| 11 | P2 | Define Archi interoperability oracle using Archi and public fixtures | 3% |

## Council concerns

### Advisory

- Favor standards-first portability over project-specific shortcuts.
- Stabilize build/test feedback before semantic expansion.
- Use public fixtures only; this repository is public.
- Keep diagram rendering deterministic so HTML and Markdown artifacts cannot drift.
- Use maintained Node.js lines; do not spend effort preserving Node.js 20 behavior.

### Adversarial

- A green build that only checks formatting is false confidence.
- BDD without deterministic fixtures becomes expensive theater.
- ArchiMate relationship maps are high-risk because small errors look visually plausible.
- Browser screenshots are fragile until fonts, layout, and SVG serialization are controlled.
- Any private PLM/reference-architecture data in fixtures would contaminate the fork.
- Runtime targets below maintained LTS dilute quality and slow dependency modernization.

## Issue-ready acceptance criteria by rank

### Rank 1: Enable operational CI and baseline test harness on Node.js 24/22

- CI runs on pushes and pull requests.
- CI installs dependencies without browser postinstall side effects.
- Node.js 24 is the primary lane.
- Node.js 22 is the compatibility lane.
- Node.js 20 is not part of the forward baseline.
- `npm test` exists and passes.
- `npm run compile` exists and proves the public entry point bundles.

### Rank 2: Remove unsafe full XML/model logging

- No full XML/model payloads are logged by default.
- Debug logging is opt-in.
- Tests cover redaction/suppression behavior.

### Rank 3: Establish deterministic compile/package contract

- Package entry point, published files, and browser bundle contract are documented.
- Compile output is reproducible enough for CI.
- Missing lockfile policy is resolved.

### Rank 4: Build public ArchiMate fixture suite

- Fixtures contain no private project data.
- Fixtures cover at least one view, one relationship per major type, and model metadata.
- Fixture provenance is documented.

### Rank 5: Validate Open Group model exchange import/export

- Import preserves IDs, concepts, relationships, views, labels, and style data where supported.
- Export round-trip diffs are explainable.
- Unsupported exchange fields are documented.

### Rank 6: Align relationship matrix with ArchiMate standard

- Relationship maps are tested against a generated expected matrix.
- Invalid combinations are rejected consistently.
- Junction and relationship-to-relationship cases are covered.

### Rank 7: Create deterministic SVG export API

- API renders a selected view to SVG without UI interaction.
- Stable IDs/classes and font handling are defined.
- SVG is safe to embed in HTML and Markdown-generated images.

### Rank 8: Embed one diagram source in HTML and Markdown image reports

- Same model/view source feeds HTML and rendered Markdown image artifacts.
- Report output includes provenance from model ID and view ID.
- Drift checks fail when HTML and image paths diverge.

### Rank 9: Add BDD scenarios for report workflows

- Feature files describe user-visible report behavior.
- Step tests run in CI only after deterministic fixtures exist.
- Scenarios avoid private-domain assumptions.

### Rank 10: Modernize lint/dependency/tooling debt

- ESLint debt is reduced or baseline-managed.
- Deprecated test/build dependencies are replaced or justified.
- Security and maintenance warnings are tracked.

### Rank 11: Define Archi interoperability oracle using Archi and public fixtures

- Archi import/export behavior is used as a reference where licensing permits.
- Differences between Archi and this library are captured as compatibility notes.
- Oracle checks are automated or documented as reproducible manual checks.
