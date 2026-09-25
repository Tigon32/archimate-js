# Experimental public Modeler API

`archimate-js/modeler` exposes the browser editor facade for MEFF files that
are eligible for the project-owned DTO editing profile. The API is experimental
under the repository's [`0.y.z` release policy](../releases.md#version-channels):
it is a documented public entry point, but breaking changes may still ship
before `1.0.0` when recorded in the changelog.

```ts
import Modeler from 'archimate-js/modeler';

const modeler = new Modeler({ container });
const opened = await modeler.open(xml, { viewId: 'view-dto-export' });

if (opened.eligible) {
  modeler.execute({ type: 'move', viewId: opened.viewId!, nodeId: 'node-component', x: 40, y: 50 });
  const { xml: meffXml, dtoJson } = modeler.save();
  // Write artifacts only after save() returns both validated outputs.
}

modeler.destroy();
```

Do not log full XML or DTO payloads by default. Diagnostics exposed through this
API are stable-coded and content-minimized so callers can report unsupported
inputs without copying architecture data.

## Lifecycle

Create a facade with `new Modeler({ container, width?, height? })`. `open(xml,
{ viewId? })` imports the XML through the legacy browser modeler first, then
opens a DTO session. It returns `{ eligible, reasons, viewId? }`; `reasons`
contains content-free diagnostics when the import is outside the editable DTO
subset. Calling `open` again closes the previous session before importing the
next model.

`save()` returns `{ xml, dtoJson }` from the DTO session. It throws a stable
coded error when no eligible session is open, the facade has been destroyed, or
the underlying DTO session detects an ineligible state. `close()` detaches the
current DTO session and canvas port. `destroy()` is idempotent, closes the
session, removes facade listeners, and destroys the underlying diagram-js
modeler.

## Operations and events

Persistent edits use serializable `EditorCommand` values:

```ts
modeler.execute(command);
modeler.undo();
modeler.redo();
modeler.select(['node-component']);
const selectedIds = modeler.getSelection();
const projection = modeler.project();
modeler.fitView();
modeler.zoom(0.8);
modeler.zoom('fit');
```

`project()` returns an engine-neutral `CanvasProjection` with DTO identifiers,
geometry, labels, style, and selected IDs. Viewport methods route through the
adapter layer; they do not expose a canvas object.

Subscribe with `on(type, handler)`. The returned function unsubscribes the
handler.

```ts
const off = modeler.on('selection', (event) => {
  console.log(event.viewId, event.selectedIds);
});
```

Events are plain data:

| Event | Payload |
| --- | --- |
| `opened` | `{ eligible, reasons, viewId? }` |
| `closed` | no model payload |
| `changed` | `{ viewId, selectedIds, model }` DTO data |
| `selection` | `{ viewId, selectedIds, model }` DTO data |

No diagram-js event object, element, canvas, moddle object, or command stack is
included in these payloads.

## API classification

| Surface | Classification | Compatibility |
| --- | --- | --- |
| `Modeler`, `ModelerOptions`, `OpenResult`, `ModelerEvent`, lifecycle, save, events, operations, `EditorCommand`, `CanvasProjection` | Stable-experimental public API | Documented public boundary while `0.y.z`; breaking changes may occur before `1.0.0` with changelog notes. |
| `DiagramJsCanvasPort`, `DtoModelerSession`, and their service/result types from `archimate-js/modeler` | Adapter-level advanced API | Public home for advanced integrations, but still tied to the current diagram-js adapter. Prefer the facade for application code. |
| `getEngineCapabilities('diagram-js')` | Engine-specific escape hatch | Explicitly **UNSTABLE** and not covered by compatibility policy. It returns `{ get(serviceName) }` for opt-in diagram-js service access. Normal editing must not require it. |

The deprecated compatibility re-exports from `archimate-js/model-dto` remain
available during the migration window. New consumers should import
`DiagramJsCanvasPort` and `DtoModelerSession` from `archimate-js/modeler`.
