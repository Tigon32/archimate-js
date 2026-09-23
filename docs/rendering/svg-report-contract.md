# Deterministic SVG report contract

The same model/view source must drive browser embedding, SVG export, and Markdown-rendered report images.

## Target pipeline

```text
model XML + view id
  -> parsed model
  -> canonical view model
  -> deterministic SVG
  -> HTML embed and Markdown image asset
```

## API contract

The eventual API should expose a headless path with this shape:

```js
const svg = await renderViewToSvg({
  xml,
  viewId,
  archimateVersion: '3.x',
  diagnostics: true
});
```

## Determinism requirements

- Stable element ordering.
- Stable generated IDs and classes.
- No timestamps, random IDs, local paths, hostnames, or environment data.
- Explicit font policy.
- Explicit dimensions/viewBox.
- Stable diagnostics for missing or invalid view IDs.
- SVG safe for HTML embedding and derived PNG generation.

## Accessibility requirements

- SVG `role` and title/description metadata where feasible.
- Element labels represented as text, not only paths.
- Semantic source model and view IDs available as non-private metadata.

## Acceptance checks

| Check | Expected result |
|---|---|
| Same input rendered twice | Byte-stable or structurally stable SVG |
| Missing view ID | Deterministic diagnostic |
| HTML embed path | Uses the same SVG output |
| Markdown image path | Uses an artifact derived from the same SVG output |
| Private data scan | No full XML/model payload in output metadata |

## Related issues

- #13
- #14
- #15
