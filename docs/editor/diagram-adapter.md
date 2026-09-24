# DTO editor command boundary (issue #94)

`DiagramAdapter` in `archimate-js/model-dto` owns a validated `ModelDto`. Its
`CanvasPort` receives plain projection values and sends commands containing
identifiers and geometry. No renderer, moddle, or diagram-js instance is stored
in the DTO or exposed through the port. MEFF imports should enter through
`createDtoEditorFromMeff`, which rejects fields that cannot survive a MEFF
round trip. The adapter validates a full candidate DTO before each command
commits. Failed commands leave the model and history intact.

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
event bus, and selection service. It draws one active view from plain
projection values, maps selection back to view IDs, and clears canvas elements
and listeners on detach. Node projections include semantic type/name and
style; connection projections include relationship type/name, style, and
endpoints. Renderer-only facades and canvas elements remain private to the
port. Native gesture-to-command translation is added by the follow-on editing
issues. The headless `CanvasPort` contract already supports ID-only commands.

The adapter's move, resize, connect, reconnect, delete, and presentation label
commands use a snapshot-backed undo/redo stack. A node move carries its nested
children and attached endpoints; deletion removes attached view connections
but leaves semantic elements and relationships in the model. UI selection is
ephemeral. `getModel()`, `project()`, and change events return detached values,
and `serialize()` saves validated DTO JSON.

MEFF export uses the fail-closed DTO converter. It rejects models with omitted
fields or variants that cannot survive a MEFF round trip. Callers must handle
`MEFF_DTO_EXPORT_INVALID` and preserve the original model for unsupported
inputs; a rejected export emits no partial XML.

The existing `Modeler`/`BaseViewer` entry point still uses moddle objects and
the original diagram-js editing services. Routing its native gestures through
DTO commands and moving its live save path to the adapter remain before issue
#94 is complete. Unsupported imports stay on the original viewer path so the
legacy save path cannot silently drop their model fields.
