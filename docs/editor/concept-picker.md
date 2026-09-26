# Searchable concept picker

The concept picker is an accessible vanilla-DOM workflow for creating an
ArchiMate element at a chosen diagram coordinate. It uses
`CONCEPT_REGISTRY` as its only option source. Renderer keys and SVG shape names
are never creation authority.

## Integration contract

The adapter owns the diagram-js hookup. On a double-click of blank canvas, it
must reject events from shapes, text inputs, and active direct editing. It
converts the browser client coordinate to diagram coordinates through the
engine adapter API, then constructs `ConceptPicker` with:

- the active `viewId` and converted `{ x, y }`;
- the original client-space pointer as `anchor` for popup placement (kept
  distinct from the diagram-space creation coordinate);
- an editor service that generates deterministic, collision-free element/node
  IDs and passes the resulting `create-element` DTO command to `execute`;
- `startNameEditing(nodeId)`, implemented by the adapter's existing direct
  label-editing path; and
- the focused canvas control as `returnFocus`.

`ConceptPicker` creates an `archimate:<type>` semantic element and an element
view node with the supplied diagram coordinates. It starts name editing only
after command execution completes. The picker neither reads canvas DOM geometry
nor receives diagram-js objects.

## Interaction and accessibility

Search includes the presentation label, concept type, and layer. A missing
registry label is displayed by splitting its type name (for example,
`ValueStream` becomes `Value Stream`); this does not change identity. Arrow
keys select, Enter creates, and Escape closes. The dialog exposes an accessible
name, labelled search field, listbox options, live result count, native visible
focus, focus trap, and focus restoration.

The existing static palette remains available as a secondary drag/create
workflow. The picker does not replace palette, context-pad, direct-editing,
touch, or keyboard behavior.
