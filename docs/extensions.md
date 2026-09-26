# Local extension registry

`archimate-js/extensions` exposes the experimental, application-owned extension
manifest and deterministic registry. It supports extension-owned DTO property
metadata schemas and typed lint rules. It does not automatically add extension
properties to persisted DTOs or run contributed lint rules; applications may
combine the registered rules with `createLintEngine` from
`archimate-js/lint`.

```ts
import { createExtensionRegistry } from 'archimate-js/extensions';
import { createLintEngine } from 'archimate-js/lint';

const registry = createExtensionRegistry();
registry.register({
  manifestVersion: 1,
  id: 'example.review',
  version: '1.0.0',
  compatibleApi: '^0.1.0',
  contributions: {
    propertySchemas: [{ id: 'example.review.status', type: 'string', name: 'Status' }],
    lintRules: [{
      id: 'example.review/required-status',
      evaluate: () => []
    }]
  },
  initialize: ({ apiVersion }) => {
    if (apiVersion !== '0.1.0') throw new Error('Unexpected extension API.');
    return () => {};
  }
});

const lint = createLintEngine(registry.lintRules);
await registry.initialize();
// Use `lint` explicitly with a validated ModelDto.
await registry.dispose();
```

`register` accepts unknown input and validates the complete manifest before
mutating the registry. It returns a stable, content-safe diagnostic for malformed
manifests, API incompatibility, duplicate extension IDs, duplicate contribution
IDs, or a property-schema/lint-rule ID collision. Diagnostic messages do not
include manifest values or thrown exceptions. A failed registration contributes
nothing. Extension IDs and contribution IDs are deterministic, and contributions
are exposed sorted by ID.

## API compatibility

`EXTENSION_API_VERSION` is versioned separately from the ArchiMate language and
the npm package; its current value is `0.1.0`. Manifests require a numeric
`major.minor.patch` extension version and one of these `compatibleApi` forms:

| Range | Meaning |
|---|---|
| `0.1.0` | Exact API version |
| `^0.1.0` | SemVer caret range; for 0.x this is `>=0.1.0 <0.2.0` |
| `~0.1.0` | `>=0.1.0 <0.2.0` |

Only a single exact, caret, or tilde range with three numeric components is
accepted. Prereleases, wildcards, unions, and comparator sets are not supported.
The registry reports a malformed manifest for invalid range syntax and an
incompatible API diagnostic when a valid range does not include the host API.

The package remains `0.y.z` and experimental. As described in the
[release policy](releases.md#version-channels), public APIs may break within
`0.y.z`; this extension API currently promises no compatibility beyond the
declared range. `^0.1.0` only permits compatible API releases within `0.1.x`.
Any change that breaks that contract requires an extension API version change
and an explicit compatibility review; stable SemVer guarantees do not begin
before a qualifying `1.x` release.

## Lifecycle and trust boundary

Register all extensions before calling `initialize`. Initialization runs in
extension-ID order. Returned asynchronous or synchronous disposer callbacks run
in reverse initialization order. Initialization failure rolls back all
previously initialized extensions; disposal continues after individual failures.
Lifecycle failures throw `ExtensionLifecycleError` with a stable code and the
underlying errors so callers can report or handle them explicitly.

Extensions are opt-in, locally installed or bundled trusted code. They execute
with the host application's privileges; this API is not a sandbox. The host
does not fetch, dynamically import, evaluate, or isolate extension code.
Manifests expose only application-owned DTO metadata and lint contracts, not
diagram-js objects, moddle objects, internal `lib/**` modules, or host services.

## Scope and follow-ups

This initial capability registry does not provide renderer, palette, panel,
overlay, command, exporter, custom-concept interchange, persistence, remote
loading, sandboxing, or extension installation/discovery hooks. It does not
change default viewer, CLI, lint, export, or Modeler behavior when consumers do
not opt into the registry. Editor contributions and interchange preservation
remain separate follow-up work under umbrella issue #108 and ADR-0008.

All examples and package-consumer checks use synthetic local extensions; no
private architecture data is included.
