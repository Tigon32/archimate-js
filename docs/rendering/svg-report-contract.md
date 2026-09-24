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

The public API exposes a no-visible-UI browser render path with this shape:

```js
const svg = await renderViewToSvg({
  xml,
  viewId,
  archimateVersion: '3.x',
  diagnostics: true
});
```

This helper uses the browser DOM for SVG geometry and is not a Node/server-side
renderer. Derive Markdown image assets from this canonical SVG. HTML embeds use
the same renderer through `mountViewer` and `viewer.saveSVG()`.

## Determinism requirements

- Stable element ordering.
- Stable generated IDs and classes.
- No timestamps, random IDs, local paths, hostnames, or environment data.
- Explicit font policy.
- Explicit dimensions/viewBox.
- Stable diagnostics for missing or invalid view IDs.
- SVG safe for HTML embedding and derived PNG generation.

## Accessibility requirements

- The standalone root has a title, concise description, and a graphics-document
  role with a document fallback. Structured elements and relationships carry
  their own names and graphics-object roles with group fallbacks.
- Meaningful names use the selected view's visible label, concept or
  relationship type, and relationship endpoints. Decorative geometry, markers,
  and duplicate label groups do not become additional accessible objects.
- Generated accessibility references are stable and unique. Source model IDs,
  internal paths, other views, and hidden model documentation are not exported
  as accessibility metadata. Only content represented in the selected view
  and caller-provided title/description may be named.

Graphics-ARIA roles and SVG accessible names follow the
[W3C Graphics-ARIA Recommendation](https://www.w3.org/TR/graphics-aria-1.0/)
and [SVG Accessibility API Mappings](https://www.w3.org/TR/svg-aam-1.0/).
Assistive technology support for standalone and embedded SVG varies; a
semantic export does not replace the textual outline and keyboard navigation
tracked by #104. Verify the exported SVG with VoiceOver and NVDA in a browser,
including nested groups, repeated names, and unnamed relationships. Keep
static exports out of the tab order; interactive selection behavior belongs
to the viewer/editor integration in #104.

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
