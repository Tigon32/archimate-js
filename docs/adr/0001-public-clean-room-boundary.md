# ADR-0001: Public clean-room boundary

Date: 2026-09-23
Status: Proposed

## Context

This repository is public. Architecture tooling can easily leak sensitive information if real models, private examples, internal issue text, private documentation, or generated project-specific artifacts are used as fixtures or research material.

The fork must remain reusable across projects and must not encode knowledge from any private PLM, supply-chain, Confluence, customer, or internal architecture effort.

## Decision

All development in this repository is constrained to:

1. public upstream source from `archimodel/archimate-js`;
2. public standards and public documentation referenced by URL;
3. public repositories whose license and provenance are recorded;
4. synthetic fixtures created specifically for this repository.

Private architecture material is prohibited in source, tests, fixtures, issues, prompts, comments, commit messages, generated documentation, and screenshots.

## Consequences

- Synthetic examples are preferred even when real-world examples would be faster.
- Public examples require explicit license and redistribution review.
- Research notes must distinguish facts, inferences, and open questions.
- Contributors must not copy text or diagrams from licensed standards unless redistribution rights are clear.
- Accidental public pushes are treated as irreversible disclosure events.

## References

- Upstream fork source: https://github.com/archimodel/archimate-js
- Fork provenance: ../../UPSTREAM.md
