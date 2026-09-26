# Semantic registry source of truth

The implementation registry under `src/language/` is this repository's single
normative source of truth **for this implementation**. The external normative
authority remains The Open Group ArchiMate specification and official
exchange/conformance artifacts, as recorded in
[ADR-0002](../adr/0002-standard-first-interoperability.md). The registry is an
independently authored implementation subset; it is not a complete relationship
matrix, a conformance claim, or a copy of protected specification tables.

## Authored sources

| Source | Role |
|---|---|
| `src/language/relationship-decisions.mts` | Frozen reviewed relationship decisions for the built-in ArchiMate 3.2 implementation subset. |
| `src/language/relationship-semantics.mts` | Pure shared decision service used by validator and editor surfaces. |
| `src/language/concept-registry.mts` | Frozen concept inventory used by implementation projections. |
| `src/language/semantic-profile.mts` | Typed boundary for host-supplied non-normative semantic extensions. |

## Generated projections

These files are generated from the authored sources and are **generated — do not
edit**. Regenerate them with the listed script and keep drift checks passing.

| Generated projection | Generator |
|---|---|
| `docs/standards/relationship-validation-matrix.md` generated table region | `scripts/relationship-matrix-document.mts` |
| `lib/util/relationship-semantic-projection.generated.mjs` | `scripts/relationship-semantic-projection.mts` |
| `lib/util/relationship-semantic-projection.generated.d.mts` | `scripts/relationship-semantic-projection.mts` |
| `lib/util/RelationshipSemanticsAdapter.js` | `scripts/build-relationship-semantics-adapter.mts` |
| `lib/util/RelationshipUtil.js` | `scripts/build-legacy-relationship-util.mts` |
| `lib/draw/concept-renderer.generated.mjs` | `scripts/concept-renderer-projection.mts` |

## Non-normative semantic profiles

Consumers may layer a host-supplied profile over the frozen core registry for
organization-specific or experimental decisions. Profiles are validated from
`unknown` at public boundaries, carry `id`, `version`, and `kind`
(`organization` or `experimental`), and every row must state
`nonNormative: true` with a non-Open-Group `evidenceSourceId`.

Profiles may only decide combinations that the core registry leaves
`unsupported`; they cannot flip a core `allowed` or `disallowed` row. Decision
results expose `decisionLayer`, which is `core` for built-in decisions or the
profile id for a profile decision, so callers can distinguish implementation
semantics from host policy. Profile rows are therefore extension policy, not
standards evidence.
