# DTO editor command boundary (issue #94)

`DiagramAdapter` in `archimate-js/model-dto` owns a validated `ModelDto`. Its
`CanvasPort` receives plain projection values and sends commands containing
identifiers and geometry. No renderer, moddle, or diagram-js instance is stored
in the DTO or exposed through the port. The implementation intentionally
accepts `unknown` at construction and validates a full candidate DTO before
each command commits. Failed commands leave the model and history intact.

```ts
import { DiagramAdapter, importMeffToModelDto } from 'archimate-js/model-dto';

const editor = new DiagramAdapter(importMeffToModelDto(xml));
const detach = editor.attach('view-one', canvasPort);
editor.execute({ type: 'move', viewId: 'view-one', nodeId: 'node-one', x: 120, y: 80 });
editor.undo();
const dtoJson = editor.serialize();
const xmlResult = editor.exportMeff();
detach();
```

The port translates native canvas selection and edit events into ID-only
commands. Move, resize, connect, reconnect, delete, and presentation label
edits run through a snapshot-backed undo/redo stack. A node move carries its
nested children and attached endpoints; deletion removes attached view
connections but leaves semantic elements and relationships in the model. UI
selection is ephemeral. `getModel()`, `project()`, and change events return
detached values, and `serialize()` saves validated DTO JSON.

MEFF export uses the fail-closed DTO converter. It rejects models with omitted
fields or variants that cannot survive a MEFF round trip. Callers must handle
`MEFF_DTO_EXPORT_INVALID` and preserve the original model for unsupported
inputs; a rejected export emits no partial XML.

The existing `Modeler`/`BaseViewer` entry point still uses moddle objects and
the original diagram-js editing services. A concrete diagram-js `CanvasPort`
and migration of its live editing/save path to this adapter remain to be done
before issue #94 is complete. This boundary can be exercised headlessly now
without making the legacy save path silently drop unsupported model fields.
