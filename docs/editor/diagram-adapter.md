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
  editor.switchAttachedView(canvasPort, 'view-two');
  editor.undo();
  const dtoJson = editor.serialize();
  const xmlResult = editor.exportMeff();
  detach();
} else {
  // Keep using the original XML through the existing viewer path.
  showImportReasons(result.reasons);
}
```

DTO-owned creation commands use deterministic caller-provided IDs and validate
the complete detached candidate before committing:

```ts
editor.execute({
  type: 'create-element',
  viewId: 'view-one',
  element: { id: 'process-new', type: 'archimate:ApplicationProcess',
    name: 'Synthetic process' },
  node: { id: 'node-process-new', kind: 'element', elementId: 'process-new',
    x: 420, y: 80, width: 140, height: 70, nodes: [] }
});
editor.execute({
  type: 'create-relationship',
  viewId: 'view-one',
  relationship: { id: 'assignment-new', type: 'archimate:Assignment',
    sourceId: 'component-one', targetId: 'process-new' },
  connection: { id: 'connection-new', kind: 'relationship',
    relationshipId: 'assignment-new', sourceId: 'node-component',
    targetId: 'node-process-new',
    waypoints: [
      { x: 160, y: 75, kind: 'sourceAttachment' },
      { x: 420, y: 115, kind: 'targetAttachment' }
    ] }
});
```

`create-element` stores its semantic element and view node in one undoable
snapshot. `create-relationship` stores its semantic relationship and view
connection in one snapshot. Element types come from the public concept
registry; relationship types use the supported MEFF vocabulary and endpoint
tuples pass the reviewed relationship service. Disallowed and unreviewed
tuples retain the `DTO_RELATIONSHIP_DISALLOWED` versus
`DTO_RELATIONSHIP_UNSUPPORTED` distinction. Duplicate IDs, invalid fields,
endpoints, geometry, or round-trip data leave model, undo, and redo history
unchanged. The M10 diagram-js integration intercepts generic
element-to-element connection gestures for relationship selection. Dragging a
connector into empty canvas opens a compatible target chooser. Its selected
concept, node, relationship, and connection use the single
`create-related-element` command; the entire candidate is validated before
commit, so cancel and invalid input leave no partial concept or history entry.

`DiagramJsCanvasPort` now lives in `src/diagram-js-adapter/`; its compatibility
re-export from `archimate-js/model-dto` is deprecated until the EE-M4
`archimate-js/modeler` entry (#346) becomes the public import path. The adapter
adapts a Viewer or Modeler canvas, element factory, event bus, selection
service, and (for editing) modeling service. Pass the modeling service from
`instance.get('modeling')` to route native
`moveElements`, `resizeShape`, `updateLabel`, `createConnection`, `reconnect`,
and single- or multi-item removal operations into the adapter
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
on detach. `switchAttachedView(port, viewId)` validates the selected DTO view,
reprojects it onto the same attached canvas, and reroutes the existing
ID-only command and selection listeners to that view without exposing engine
objects. An invalid, deleted, or unsupported target view is rejected before the
binding changes, so the prior view stays active and no partial canvas state is
advertised. Each supported move, resize, label, relationship, or removal gesture becomes one DTO
command; undo and redo rerender the same active view from DTO history. `move`
uses absolute diagram-space `x`/`y` coordinates for one node.
`move-many` uses the same absolute coordinate shape for each entry:
`{ type: 'move-many', viewId, moves: [{ nodeId, x, y }] }`. All nodes must
already exist in the same view and remain under their current parent; nested
children and attached endpoint waypoints follow as they do for single-node
moves. Reparenting and attachment gestures are rejected before diagram-js can
mutate state. Node projections include semantic type/name and
style; connection projections include relationship type/name, style, and
endpoints. Renderer-only facades and canvas elements remain private to the
port. The headless `CanvasPort` contract also supports ID-only commands.

New live relationships require an explicit relationship type accepted by the
existing ArchiMate rule service. The port stores the semantic relationship and
view connection in one command. Reconnecting changes semantic endpoints only
when no other view connection refers to the relationship; shared relationships
cannot be retargeted through one view. Removing one or more view nodes removes
attached view connections but retains semantic elements and relationships.

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
affordance and DTO edit validation now use the same relationship decision
service. A RuleProvider rejection is limited to a known `disallowed` row;
`unsupported` is deferred so the DTO command can report
`DTO_RELATIONSHIP_UNSUPPORTED` without committing state. This strict editor
check does not make unsupported tuples persistable. The service remains a
conservative 23-row reviewed profile; broader registry/profile work remains
under #102, and structured relationship diagnostics were introduced with #333.

The adapter's move, move-many, resize, connect, reconnect, delete, delete-many,
apply-layout-patch, and presentation label commands use a snapshot-backed
undo/redo stack. A node move carries its nested children and attached
endpoints. `delete-many` removes selected view nodes and view connections in
one undo step, deduplicating overlaps such as a selected connection already
removed by a selected endpoint node; semantic elements and relationships are
retained. `apply-layout-patch` applies a `LayoutPatch` from `src/layout` as one
undoable geometry edit. It validates the patch view, item existence, integer
node geometry and waypoints, and current geometry (`before` when applying
`after`, `after` when applying `before`) before changing node bounds or
connection waypoints. Stale patches fail with stable content-free codes such as
`DTO_LAYOUT_PATCH_STALE` and leave history unchanged. UI selection is
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
import { DtoModelerSession } from 'archimate-js/model-dto'; // Deprecated compatibility re-export.

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

## Deterministic operation log

`DiagramAdapter.exportOperationLog(clientId)` returns a detached version-1
`EditorOperationLog`; `serializeOperationLog(clientId)` emits its deterministic
JSON representation. `parseOperationLog(json)`,
`validateOperationLog(value)`, and `serializeOperationLog(value)` validate and
canonicalize standalone log values. The public `Modeler` facade exposes the
same export/serialize operations and `replayOperationLog(log)`.

The log envelope has a fixed field order and schema:

```json
{"schemaVersion":1,"clientId":"stable-client","operations":[{"sequence":1,"operationId":"stable-client:1","action":"command","command":{"nodeId":"node-one","type":"move","viewId":"view-one","x":120,"y":80}}]}
```

The envelope fields serialize as `schemaVersion`, `clientId`, `operations`;
operation fields serialize as `sequence`, `operationId`, `action`, and then
`command` for command entries. Command objects and nested plain-object payloads
use sorted key order. A caller supplies a stable identifier accepted by the
DTO identifier syntax; no random, clock-based, or implicit IDs are generated.
Sequences start at 1 and increase once per accepted state/history operation.
IDs are exactly `<clientId>:<sequence>`. Rejected commands and no-op undo/redo
calls do not consume a sequence or create an entry. A log holds at most
`MAX_EDITOR_OPERATIONS` (100,000) entries; an adapter at that limit rejects
further commands, undo, and redo with `EDITOR_OPERATION_SEQUENCE_INVALID`
before changing model or history.

`action: "command"` stores a validated deep copy of the `EditorCommand` payload.
`action: "undo"` and `"redo"` are explicit history operations, so replay
reproduces the source adapter's undo/redo result and current model state.
Selection, selection events, viewport state, renderer objects, and complete
model payloads are never recorded. Command creation payloads contain only the
specific DTO entities required by that command.

Replay is performed on a fresh adapter opened from the same base DTO:

```ts
const replay = new DiagramAdapter(baseDto);
replay.replayOperationLog(source.serializeOperationLog('stable-client'));
```

The replay API validates the whole log and builds the complete replay candidate
before changing the target adapter; a malformed version, sequence, duplicate
operation ID, or rejected command leaves the target model and operation
sequence unchanged. Logs do not embed or identify their base DTO, so callers
must supply the matching base and retain it separately. Replay is single-client
and local only; it provides no network transport, presence, cursor state,
collaborative selection, synchronization, distributed conflict resolution, or
CRDT behavior. Future versions may add transport-neutral extension metadata or
separately version presence/selection and synchronization contracts without
coupling this adapter to a collaboration framework.
