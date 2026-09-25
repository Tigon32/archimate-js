# MEFF 3.1 supported-subset export

`exportMeff(model)` serializes an imported model; `viewer.saveMeff()` serializes
the loaded model and returns a Promise of the same `{ xml, diagnostics }` result.
Neither changes the model or its native `saveXML` representation. For example:

```js
import { exportMeff } from 'archimate-js';

const { xml, diagnostics } = exportMeff(parsed.rootElement);
```

The supported subset consists of model identity and localized names; element
and relationship identity, concrete type, names, documentation, and relationship
endpoints; named Diagram views; nested Element nodes, their element references,
diagram-space geometry, and explicit color/font/line styles; and Relationship
connections with their relationship/node references, styles, source/target
attachments, and ordered bendpoints. Existing IDs are retained; no synthetic
IDs or renderer defaults are written into exchange XML.

The separate `archimate-js/model-dto` editor profile also supports explicitly
defined scalar property definitions and concept property values; see
[`../editor/model-dto-profile.md`](../editor/model-dto-profile.md). This does
not expand the `exportMeff()` root-model API described above.

After a diagram edit, current diagram-space node bounds take precedence over
the imported geometry snapshot. Current integer connection waypoints are
serialized in order (first and last as attachments, interior points as
bendpoints). A changed route with fractional or otherwise invalid waypoints
is omitted and diagnosed rather than rounding values or exporting a stale
route. The relationship and node references still export.

Required IDs must be unique XML IDs, and mandatory references must resolve to
exported records. Invalid required data rejects export with the static code
`MEFF_EXPORT_INVALID`; unsupported optional fields and skipped presentation
records return stable `MEFF_EXPORT_*` warnings without source data. Consumers
should inspect diagnostics before treating exported data as complete. A model
with omitted imported data cannot recover it from an export.

The two `SYNTHETIC` fixtures in `test/fixtures/meff-schema/` prove semantic
import/export/import equality for this bounded projection. The MEFF CI gate
generates transient exports, verifies the checksums of The Open Group's
[MEFF 3.1 Model, View, and Diagram XSDs](https://www.opengroup.org/xsd/archimate/),
and validates both exports. Schema shape and this projection test do not prove
all ArchiMate semantics, full exchange conformance, certification, or cross-tool
interoperability.
