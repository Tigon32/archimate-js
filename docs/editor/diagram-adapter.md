# DTO editor command boundary (issue #94)

`DiagramAdapter` in `archimate-js/model-dto` owns a validated `ModelDto`. Its
`CanvasPort` receives plain projection values and sends commands containing
identifiers and geometry. No renderer, moddle, or diagram-js instance is stored
in the DTO or exposed through the port. MEFF imports should enter through
`createDtoEditorFromMeff`, which rejects fields that cannot survive a MEFF
round trip. The adapter validates a full candidate DTO before each command
commits. Failed commands leave the model and history intact.

For a renderer-independent text description of a selected view, use the
[accessible outline API](accessible-outline.md). Its view node IDs are the
selection bridge planned under #104; creating an outline does not change the
editor's selection or focus.

```ts
import { createDtoEditorFromMeff } from 'archimate-js/model-dto';

const result = createDtoEditorFromMeff(xml);
if (result.eligible) {
  const editor = result.editor;
  const detach = editor.attach('view-one', canvasPort);
  editor.execute({ type: 'move', viewId: 'view-one', nodeId: 'node-one', x: 120, y: 80 });
  editor.undo();
  const dtoJson = editor.serialize();
  const xmlResult = editor.exportMeff();
  detach();
} else {
  // Keep using the original XML through the existing viewer path.
  showImportReasons(result.reasons);
}
```

`DiagramJsCanvasPort` adapts a Viewer or Modeler canvas, element factory,
event bus, selection service, and (for editing) modeling service. Pass the
modeling service from `instance.get('modeling')` to route native
`moveElements`, `resizeShape`, `updateLabel`, `createConnection`, `reconnect`,
and single-item removal operations into the adapter
before diagram-js's command stack runs:

```ts
const port = new DiagramJsCanvasPort({
  canvas: modeler.get('canvas'),
  elementFactory: modeler.get('elementFactory'),
  eventBus: modeler.get('eventBus'),
  selection: modeler.get('selection'),
  modeling: modeler.get('modeling')
});
const detach = editor.attach(activeViewId, port);
```

It draws one active view from plain projection values, maps selection back to
view IDs, and clears canvas elements and listeners and restores modeling methods
on detach. Each supported move, resize, label, relationship, or removal gesture becomes one DTO
command; undo and redo rerender the same active view from DTO history. A move
is supported for one node within its current parent. Multi-node moves,
reparenting, and attachment gestures are rejected before diagram-js can mutate
state. Node projections include semantic type/name and
style; connection projections include relationship type/name, style, and
endpoints. Renderer-only facades and canvas elements remain private to the
port. The headless `CanvasPort` contract also supports ID-only commands.

New live relationships require an explicit relationship type accepted by the
existing ArchiMate rule service. The port stores the semantic relationship and
view connection in one command. Reconnecting changes semantic endpoints only
when no other view connection refers to the relationship; shared relationships
cannot be retargeted through one view. Multi-item deletion is rejected as one
unsupported gesture. Removing a view node removes attached view connections
but retains semantic elements and relationships.

The DTO adapter validates each relationship connect and every
endpoint-changing reconnect against the reviewed ArchiMate 3.2 decision service
shared with standalone validation. A reviewed `allowed` tuple can commit;
`disallowed` raises `DTO_RELATIONSHIP_DISALLOWED`, and unreviewed combinations
raise `DTO_RELATIONSHIP_UNSUPPORTED`. These errors carry a fixed,
content-minimized `diagnostic` with a stable code, category, operation,
applicable view/connection/relationship/endpoint IDs, and a corrective reason.
`sourceId` and `targetId` identify view nodes; when resolvable,
`sourceElementId` and `targetElementId` identify their semantic model elements.
Malformed IDs, duplicate connection IDs, relationship-ID collisions,
connect commands whose `connection.relationshipId` differs from the new
`relationship.id` (`DTO_RELATIONSHIP_ID_MISMATCH`, reporting the submitted
relationship ID), relationship endpoint mismatches, and shared-relationship
retarget conflicts have distinct codes. IDs are included only when they are at
most 128 characters and free of control characters; longer IDs are redacted
even when syntactically valid. No model payload or semantic type names are
copied into the message. Every rejected command leaves model state, undo
history, and redo history unchanged.

Editor connect/reconnect commands are strict within this boundary: only
`allowed` tuples in the reviewed profile commit. `unsupported` means the tuple
is outside this repository's reviewed ArchiMate 3.2 decision set, not that the
standard universally forbids it. The standalone validator remains tri-state
and advisory for imported models; it can report unsupported profile scope
without changing the imported model. Existing imported relationships remain
unchanged until an edit is requested; adding a view reference or changing
endpoints must pass the strict editor check. Waypoint-only reconnects do not
create a new semantic claim.
MEFF/DTO relationship type names such as `archimate:Serving` resolve to the
same reviewed row as `ServingRelationship`. The canvas port's immediate gesture
affordance still comes from legacy rules; aligning that UI hint and custom
profiles is separate work under #102.

The adapter's move, resize, connect, reconnect, delete, and presentation label
commands use a snapshot-backed undo/redo stack. A node move carries its nested
children and attached endpoints. UI selection is
ephemeral. `getModel()`, `project()`, and change events return detached values,
and `serialize()` saves validated DTO JSON.

MEFF export uses the fail-closed DTO converter. It rejects models with omitted
fields or variants that cannot survive a MEFF round trip. Callers must handle
`MEFF_DTO_EXPORT_INVALID` and preserve the original model for unsupported
inputs; a rejected export emits no partial XML.

For a live `Modeler`, open one DTO session per import and save through that
session. The session imports the complete model through the existing Modeler
first, checks DTO round-trip eligibility, and attaches the canvas port only
for an eligible view:

```ts
import { DtoModelerSession } from 'archimate-js/model-dto';

const session = await DtoModelerSession.open(modeler, xml, 'view-one');
if (session.eligible) {
  // Modeler gestures update session.editor's DTO command history.
  session.editor?.undo();
  const { xml: meffXml, dtoJson } = session.save();
  // Write artifacts only after save() returns both validated outputs.
} else {
  showImportReasons(session.reasons);
}
session.close();
```

`save()` reads the latest committed DTO, validates its full MEFF round trip,
and returns MEFF XML and DTO JSON together. Diagram node and relationship
connection presentation labels, semantic IDs, endpoint references, styles,
integer geometry, and waypoints are preserved within the DTO MEFF subset.
Unsupported visual variants and fields remain ineligible, and edits outside
the MEFF subset fail with `MEFF_DTO_EXPORT_INVALID` before yielding an artifact.
Save on an ineligible or closed session, after another Modeler import, or
after an unbridged native command fails with `DTO_EDITING_INELIGIBLE`.
Failures provide stable, content-free diagnostics. Do not write a file until
`save()` succeeds.

`BaseViewer.saveXML()` keeps its existing moddle-backed contract for viewer
and legacy consumers, including imports outside the DTO subset. It does not
represent edits made through the DTO session. Call `session.save()` to persist
those edits, and retain the original model through the legacy path when the
session is ineligible.
