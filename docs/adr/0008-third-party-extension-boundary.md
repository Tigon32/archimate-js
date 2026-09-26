---
title: "ADR-0008: Establish a bounded third-party extension API boundary"
status: "Proposed"
date: "2026-09-25"
authors: "Tigon32 repository maintainers"
tags: ["architecture", "extension-api", "security"]
supersedes: ""
superseded_by: ""
---

# ADR-0008: Establish a bounded third-party extension API boundary

## Status

**Proposed** — this record sets boundaries and sequence. It does not authorize
the complete extension API or settle the editor and lint contribution contracts.

## Context

Issue [#108](https://github.com/Tigon32/archimate-js/issues/108) proposes a
versioned API for custom properties, renderers, commands, palette entries,
panels, lint rules, exporters, and interchange. That is a broad feature whose
contribution points overlap open editor workflow work in #96 and lint-rule work
in #103. The application-owned DTO and service boundaries in #92 and #94 are
the appropriate foundation; diagram-js and moddle instances are implementation
details rather than the extension contract.

The release policy supports only documented package entry points. Internal
`lib/**` and `src/**` paths are unsupported, and the current `0.0.x` line is
experimental. Before a `1.x` release, breaking public API changes may still
occur within `0.y.z`; see [the public API and release
policy](../releases.md).

Public interoperability references show both the value and the cost of
extensibility. The moddle project documents schema descriptors and retaining
unknown properties. The bpmn-js walkthrough documents local module
contributions, including access to internal services; it explicitly describes
itself as work in progress. These are behavioral references, not contracts to
copy or standards requirements.

## Decision

The proposed stable direction is a host-supplied, typed extension boundary
owned by this application. The decision is limited to these rules:

- **DEC-001 — Public contract:** Future extension types are exposed from a
  documented package entry point and use project-owned DTOs and explicit
  application services. They do not require deep imports from `lib/**` or
  `src/**`, raw diagram-js objects, or moddle implementation objects. Existing
  exports in `package.json` and [ADR-0004](0004-typescript-and-module-size.md)
  remain the source boundary.
- **DEC-002 — Trust model:** Extension code is opt-in, consumer-supplied,
  locally installed or bundled trusted code. It runs with the host
  application's privileges. The API does not promise sandboxing and must not
  fetch or evaluate executable extension code from a remote location at
  runtime.
- **DEC-003 — Compatibility:** Extension API compatibility is versioned
  separately from the ArchiMate language version. A future extension must
  declare a stable identity, its own version, and the extension API range it
  supports; the host must reject duplicate identities and incompatible API
  ranges with deterministic, content-free diagnostics. Compatibility follows
  the repository's [release policy](../releases.md): the `0.0.x` API is
  experimental, and stable SemVer guarantees begin only with a qualifying
  `1.x` release.
- **DEC-004 — Semantic boundary:** Consumer-defined specializations remain
  distinguishable from normative ArchiMate concepts. An extension cannot
  redefine standard element or relationship semantics. Unknown extension data
  is preserved only where a documented exchange contract permits it; otherwise
  the core reports a fidelity diagnostic instead of silently claiming a
  lossless round trip.
- **DEC-005 — Deferred capabilities:** Issue #422 establishes only the
  versioned manifest and deterministic registry for extension-owned property
  metadata schemas and typed lint rules, including registration diagnostics
  and lifecycle. The registry does not automatically persist metadata or
  execute contributed lint rules. Renderer or palette hooks, panels, commands,
  exporter hooks, custom-concept interchange, and remote loading remain
  deferred to follow-up issues owned by their application surfaces.

## Consequences

### Positive

- **POS-001:** Consumers get a direction for extensions that preserves the
  application-owned boundary instead of stabilizing internal dependency APIs.
- **POS-002:** Trust and compatibility limits remain explicit while trusted
  local extension callbacks execute; the registry adds no loader or sandbox.
- **POS-003:** The manifest/registry foundation is independently reviewable
  before editor, interchange, and exporter contribution points are designed.

### Negative

- **NEG-001:** The foundation is intentionally narrow; #108 remains incomplete
  until separately reviewed editor and interchange contribution contracts exist.
- **NEG-002:** Local trusted code can still affect the host application. This
  decision deliberately provides no sandbox or privilege separation.
- **NEG-003:** Preserving third-party data across an exchange format depends on
  that format's declared extension rules; otherwise consumers may receive
  fidelity warnings or loss.

## Alternatives considered

### Expose existing internal modules as the extension API

- **ALT-001:** Let consumers import diagram-js, moddle, or application
  implementation modules and pass them as extension modules.
- **ALT-002:** Rejected because the repository's release policy explicitly
  leaves internal paths unsupported, and dependency-level module shapes would
  become accidental compatibility promises. The bpmn-js walkthrough is useful
  evidence of an extensibility pattern, but it is not this package's API
  contract.

### Keep the product permanently closed to extensions

- **ALT-003:** Keep all capabilities internal and ask each consumer to maintain
  a fork for custom metadata and workflows.
- **ALT-004:** Rejected because it does not meet #108's stated consumer need and
  increases divergence from the supported package boundary.

### Load remote extensions or claim sandbox isolation

- **ALT-005:** Fetch code dynamically or promise that extension code is isolated
  from the host application.
- **ALT-006:** Rejected because a browser bundle or TypeScript type boundary is
  not a security sandbox. This repository has no remote-code loader or
  isolation runtime, and implementing one is outside #108.

## Implementation notes

- **IMP-001:** Keep #108 as an umbrella. Child issues define only the
  contribution points established by their owning application surfaces; #422
  is the first bounded manifest/registry slice and does not unblock deferred
  editor or interchange capabilities.
- **IMP-002:** A later API issue can define the manifest and deterministic
  validation against these boundaries; a separate reference package should
  verify the documented consumer contract without deep imports.
- **IMP-003:** Before `1.x`, document every public API change under the
  experimental `0.y.z` release policy. Before declaring stable compatibility,
  test a packed external consumer against supported API versions.
- **IMP-004:** Do not copy implementation code from the public precedents. Any
  future copied or adapted material still requires explicit provenance and
  compatible licensing.
- **IMP-005:** The current `archimate-js/extensions` contract and its
  experimental `0.1.0` API version are documented in
  [`docs/extensions.md`](../extensions.md). The package remains `0.y.z`;
  declared ranges do not imply stable compatibility guarantees.

## References

- **REF-001:** Repository issue [#108](https://github.com/Tigon32/archimate-js/issues/108) and its stated dependencies #96/#103.
- **REF-002:** [#92 typed DTO contract](https://github.com/Tigon32/archimate-js/issues/92) and [#94 typed adapter boundary](https://github.com/Tigon32/archimate-js/issues/94).
- **REF-003:** [Public API and release policy](../releases.md).
- **REF-004:** [ADR-0004: TypeScript-first incremental migration and module size](0004-typescript-and-module-size.md).
- **REF-005:** [bpmn-io/moddle](https://github.com/bpmn-io/moddle), a public model-schema extension reference; retrieved 2026-09-25. Its MIT license is a provenance reference only; no code is copied.
- **REF-006:** [bpmn-js walkthrough](https://bpmn.io/toolkit/bpmn-js/walkthrough/), an interoperability reference that documents module contributions and currently labels itself work in progress; retrieved 2026-09-25.
- **REF-007:** [Package entry points](../../package.json) and the published `exports` allowlist.
