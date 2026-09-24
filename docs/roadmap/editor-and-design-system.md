# Editor and design system roadmap

Date: 2026-09-24
Status: Recommended direction

## Recommendation

Build a small, project-owned design system and keep `diagram-js` as the editor
canvas for the current roadmap. Separate the application's controls from
ArchiMate notation styling. Define an adapter boundary between the typed model
and view data and the diagram engine so that a future engine evaluation stays
possible.

The new viewpoint material adds a useful editor feature: show authors when a
view contains concepts outside its selected example viewpoint. Treat that as
guidance by default, with opt-in strictness for teams that enforce a viewpoint.
Do not publish the extracted `spec/` or `catalog/` content or a copied viewpoint
catalog in this repository.

## Design system

The public application is a Webpack-built browser package with an SVG renderer
and diagram-js editor. It does not currently use React. Its global stylesheet
imports diagram-js styles, applies broad element selectors, and loads two remote
font stylesheets. The renderer also sets ArchiMate fills, strokes, and markers
in SVG. One token set should not control both the product controls and the
language's notation.

Use three token layers:

1. **Product tokens:** semantic colors, spacing, typography, borders, focus
   rings, elevation, and motion for toolbars, palette, dialogs, inspectors, and
   status messages.
2. **Component styles:** project-owned, accessible controls built on those
   product tokens. Scope selectors under application roots instead of resetting
   generic `button`, `ul`, or other page-wide elements.
3. **ArchiMate notation tokens:** element/domain colors, shapes, relationship
   line patterns, markers, labels, and selection/hover states used by the SVG
   renderer. Keep notation defaults distinct from UI theme choices and preserve
   explicit styles stored in model data.

Start with CSS custom properties and a small component layer. This is framework
independent, works with the existing generated browser bundle, and also supports
a future single-file HTML build. Audit remote font loads as part of this work;
locally packaged, license-checked fonts make offline distribution more reliable.

### UI and styling alternatives

| Option | Fit for this repository | Recommendation |
| --- | --- | --- |
| CSS custom properties + owned components | Direct fit for the current vanilla JavaScript and diagram-js UI; no new rendering framework. | **Use now.** Add token names and document component states before adding more editor controls. |
| Tailwind CSS v4 | Can supply tokens and utility classes without React, but adds a CSS build step and spreads utility classes through templates. Dynamically-created diagram-js SVG/classes need separate renderer styling. | Consider when the application shell gets a planned component rewrite. Keep SVG notation on semantic CSS variables. |
| shadcn/ui | Source-owned React components with a strong accessibility and customization ecosystem. Its normal component model is React, which this package does not use. | Do not add to the current editor piecemeal. Re-evaluate if a React shell is selected. |
| `@shadcn/lint` | Tailwind v4 design-system rule linter for ESLint/Oxlint; it enforces policies but does not provide components or a visual system. The project would first need a compatible Tailwind/framework setup and lint integration. | Defer. Pilot it only after a Tailwind v4 token/component system exists. |
| Fluent UI Web Components or Spectrum Web Components | Framework-neutral ready-made controls. Each brings its own component APIs and visual language. | Evaluate only if the owned control layer becomes a substantial burden or accessibility testing identifies a concrete gap. |
| Open Props | A source of general CSS tokens and primitives, not an ArchiMate-specific editor design system. | Use as a reference if helpful; do not import global styles wholesale. |

Tailwind's `@theme` variables can generate utilities from design tokens, while
regular CSS variables can remain independent of a utility API. `@shadcn/lint`
currently targets Tailwind v4 and supports ESLint/Oxlint. shadcn/ui provides
component source rather than a drop-in framework-neutral stylesheet. These are
useful options if the UI framework changes, not prerequisites for centralizing
the current renderer and controls.

## Diagram engine alternatives

The current editor is deeply integrated with `diagram-js`: `BaseViewer` extends
its `Diagram`; the ArchiMate renderer extends its `BaseRenderer`; rules extend
its `RuleProvider`; and `Modeler` composes its editing modules and command stack.
Replacing it would require rebuilding the editor's canvas lifecycle, extension
system, selection, commands/history, interactions, and SVG integration. The
engine's MIT license and separate generic project identity do not by themselves
keep this product tied to the `archimate-js` fork.

| Engine | Strength | Cost or gap for this app | When to choose it |
| --- | --- | --- | --- |
| `diagram-js` | Open-source, SVG-focused diagram toolkit; already provides the canvas, module system, command stack, selection, and core interactions used here. | Current UI and editor features remain custom work; layout and ArchiMate semantics are not supplied by the engine. | **Keep for now.** Add capabilities as ArchiMate modules and preserve the typed boundary around it. |
| React Flow (`@xyflow/react`) | Strong open-source node/edge editor with custom React nodes, edges, and handles; good TypeScript experience. | Requires React and a new editor shell. ArchiMate model semantics, MEFF projection, viewpoint feedback, and editor-specific commands still need application code. | Shortlist if the product commits to React and a node-based interaction model. |
| JointJS | Framework-independent SVG graph editor with graph and link primitives, routing, and layout options. | Core is MPL-2.0; JointJS+ features are commercial. It still requires a full adapter/editor migration and ArchiMate-specific behavior. | Best non-React engine to spike if diagram-js has a documented feature gap. Review license obligations first. |
| GoJS or yFiles for HTML | Mature commercial diagramming products with broad editing, layout, routing, and export capabilities. | Commercial licensing and a full editor migration; evaluate distribution terms and total cost. | Consider if concrete user requirements justify purchasing a complete diagramming toolkit. |
| Three.js, Fabric.js, Konva, or whiteboard SDKs | Useful for 3D scenes, general canvas drawing, or freeform whiteboards. | They do not provide the semantic graph editor and SVG-style notation this product needs; the application would own more interaction, accessibility, graph rules, and export behavior. | Not a fit for the current 2D ArchiMate editor. Revisit Three.js only for a separately defined 3D product feature. |

For automatic layout, evaluate a layout engine as a separate service before
replacing the editor. ELK.js provides graph layout algorithms and can return
geometry to the existing view model. Its package declares `EPL-2.0 OR
GPL-3.0-or-later`, so review the chosen license path before distribution. Apply
layout as one reversible editor command so users can undo or restore positions.

## Editor delivery sequence

Keep the language model separate from rendered canvas objects:

```text
Typed ArchiMate model and view DTOs
          ↓
Import, validation, viewpoint feedback, and commands
          ↓
Diagram adapter: selection, geometry, events, and SVG rendering
          ↓
diagram-js canvas
```

The view DTO should own semantic IDs, node bounds, nesting, connection
endpoints, bendpoints, labels, and explicit style overrides. The engine objects
are projections used for drawing and interaction. This makes save/export
independent of canvas internals and limits the cost of any later engine switch.

Deliver editor work in these slices. Keep existing behavior where it already
passes its contract; use the slices to close gaps and define stable acceptance
criteria:

1. **Editor contract and typed boundary:** document Viewer versus Modeler APIs;
   define model and view DTOs; ensure all persistent edits flow through typed
   commands and round-trip through save/import.
2. **Core editing:** select and navigate; create, move, resize, delete, connect,
   and reconnect; enforce ArchiMate relationship rules; edit labels and
   properties; support undo/redo for every persistent action.
3. **Modeling workflow:** provide palette/search, model tree, properties
   inspector, multiple views, keyboard access, and viewpoint feedback. Viewpoint
   checks default to warnings; team policies may opt into stricter validation.
4. **Diagram productivity:** clipboard, replacement, alignment, snapping, route
   editing, reversible optimize/layout, and large-view performance work.
5. **Quality gate:** browser interaction tests for keyboard and pointer flows,
   accessible names/focus, stable SVG output, persisted geometry, and
   import/edit/export/re-import behavior.

## Engine-switch gate

Do not switch engines for branding reasons or because another library has a
longer feature list. Start a time-boxed prototype only after a concrete user
requirement cannot be met economically on diagram-js. Use the same synthetic
view in each candidate and test nested shapes, ArchiMate-constrained connection
creation, reconnecting, bendpoint editing, command undo/redo, accessibility,
SVG export, and imported geometry preservation. Compare implementation effort,
runtime behavior, browser support, license, and standalone distribution before
choosing.

## Sources

- Repository architecture: [`BaseViewer`](https://github.com/Tigon32/archimate-js/blob/main/lib/BaseViewer.js), [`Modeler`](https://github.com/Tigon32/archimate-js/blob/main/lib/Modeler.js), [`ArchimateRenderer`](https://github.com/Tigon32/archimate-js/blob/main/lib/draw/ArchimateRenderer.js), and [`ArchimateRules`](https://github.com/Tigon32/archimate-js/blob/main/lib/features/rules/ArchimateRules.js).
- [`diagram-js`](https://github.com/bpmn-io/diagram-js): generic browser diagram toolkit, MIT license.
- [Tailwind theme variables](https://tailwindcss.com/docs/theme) and [shadcn/ui documentation](https://ui.shadcn.com/docs): styling tokens and component approach.
- [`@shadcn/lint`](https://github.com/shadcn-ui/lint): design-system lint rules for Tailwind v4.
- [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes) and [custom edges](https://reactflow.dev/learn/customization/custom-edges).
- [JointJS introduction](https://docs.jointjs.com/) and [licensing](https://www.jointjs.com/license).
- [GoJS commercial licensing](https://gojs.net/latest/learn/deployment) and [yFiles for HTML licensing](https://docs.yworks.com/yfiles-html/dguide/deployment/licensing.html).
- [Fluent UI Web Components](https://learn.microsoft.com/en-us/fluent-ui/web-components) and [Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/).
- [ELK.js](https://github.com/kieler/elkjs): layout algorithms and package license expression.
