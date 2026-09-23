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
- Keep research claims in `docs/research/` with public citations.
- Record consequential decisions as ADRs under `docs/adr/`.
- Do not use generated or copied code unless provenance and license are explicit.
- Do not add binary files without a provenance record and a clear need.
- Never log full model XML, imported models, or architecture payloads by default.
