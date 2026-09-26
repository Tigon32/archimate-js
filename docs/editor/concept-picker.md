# Searchable concept picker

The concept picker is an accessible vanilla-DOM workflow for creating an
ArchiMate element at a chosen diagram coordinate. It uses
`CONCEPT_REGISTRY` as its only option source. Renderer keys and SVG shape names
are never creation authority.

## Canvas integration

The diagram-js adapter listens for double-clicks on the blank SVG canvas and
ignores shapes, text inputs, and active direct editing. It converts client
coordinates to diagram coordinates using the canvas viewport, then constructs
`ConceptPicker` with:

- the active `viewId` and converted `{ x, y }`;
- the original client-space pointer as `anchor` for popup placement (kept
  distinct from the diagram-space creation coordinate);
- an editor service that generates deterministic, collision-free IDs and
  passes a `create-element` DTO command to the Modeler;
- a name-editing callback that routes the first direct-editing change to the
  semantic element name, rather than storing it as a view-only label; and
- the focused canvas control as `returnFocus`.

`ConceptPicker` creates an `archimate:<type>` semantic element and view node at
the supplied diagram coordinates. Name editing begins only after command
execution completes. The picker itself neither reads canvas geometry nor
receives diagram-js objects.

## Interaction and accessibility

Search includes the presentation label, concept type, and layer. A missing
registry label is displayed by splitting its type name (for example,
`ValueStream` becomes `Value Stream`); this does not change identity. Arrow
keys select, Enter creates, and Escape closes. The dialog exposes an accessible
name, labelled search field, listbox options, live result count, native visible
focus, focus trap, and focus restoration.

The existing static palette remains available as a secondary drag/create
workflow. The picker does not replace palette, context-pad, touch, or keyboard
behavior. Browser coverage verifies double-click on blank canvas, layer/type
search, deterministic semantic/view IDs, pointer-position projection, immediate
semantic-name editing, and MEFF/DTO reimport using the SYNTHETIC DTO fixture.

Relationship quick-create reuses the same registry and picker contract. Its
results are filtered through the reviewed relationship semantics service before
the existing `create-element` and `create-relationship` DTO commands run.
