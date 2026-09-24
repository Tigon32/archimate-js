# Agent and contributor guardrails

This repository is a public fork of `archimodel/archimate-js`. Treat it as public-source-only work.

## Non-negotiable boundary

Do not commit, paste, generate, or infer from private project material. This includes:

- customer, PLM, Confluence, Jira, Slack, email, or private GitHub content;
- real architecture models, exports, payloads, screenshots, names, hostnames, IPs, credentials, costs, controls, or environment details;
- prompt transcripts or generated artifacts that contain non-public architecture knowledge.

Fixtures must be `PUBLIC` or `SYNTHETIC` and must state their provenance.

## Architecture priorities

Weighted implementation priority:

| Area | Weight |
|---|---:|
| ArchiMate semantics and exchange correctness | 35% |
| Deterministic SVG/report rendering | 25% |
| Browser embedding and live editing stability | 20% |
| Supply-chain, CI, and release hygiene | 15% |
| Convenience features | 5% |

## Standards position

The Open Group ArchiMate specification and published exchange/conformance artifacts are normative. Archi and other tools may be used as behavioral interoperability references, but they do not override the standard.

## Work style

- Prefer small reviewed PRs.
- Run `npm ci` in a fresh checkout so the repository-owned Git hooks are installed. The pre-push hook runs the fast `npm run verify:wip` durability gate; `npm run verify:local` is the full qualification gate.
- Create a Draft PR early and push coherent WIP checkpoints often so collaborators can inspect progress and work survives an agent/workspace failure. Push before risky refactors, long-running operations, and handoffs; prefer additive checkpoint commits and squash at merge.
- Do not bypass the pre-push gate for agent-generated changes. Keep WIP PRs Draft and run `npm run verify:local` before marking them ready so remote CI remains the authoritative review/merge boundary.
- Use the [issue contribution guide](docs/contributing/issues.md) for issue routing and evidence requirements.
- For shared-account concurrent work, follow the [manual agent coordination runbook](docs/contributing/agent-coordination.md).
- Keep umbrella/child scope and PR recovery decisions in those canonical guides; do not duplicate their protocol here.
- Keep research claims in `docs/research/` with public citations.
- When a behavior is verified to conflict with a normative ArchiMate specification or official exchange/conformance artifact, require a public GitHub issue with a source citation and minimal `PUBLIC` or `SYNTHETIC` reproduction. Search for duplicates first. Record the tested package version and runtime, expected and actual behavior, and keep private architecture data out of reports. Treat documented unsupported scope as a limitation unless new evidence changes the boundary; treat consumer preferences as feature requests. The Open Group is normative; other tools are interoperability references only.
- Record consequential decisions as ADRs under `docs/adr/`.
- Do not use generated or copied code unless provenance and license are explicit.
- Do not add binary files without a provenance record and a clear need.
- Never log full model XML, imported models, or architecture payloads by default.
