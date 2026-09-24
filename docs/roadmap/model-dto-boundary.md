# Model DTO boundary: first slice of issue #92

`src/model-dto/` defines a versioned, project-owned, plain-data model and view
contract. `projectImportedModelDto(unknown)` accepts the current MEFF importer's
model object (or its `{ rootElement, diagnostics }` result), copies supported
fields, and validates the copy. `validateModelDto(unknown)`,
`serializeModelDto(unknown)`, and `parseModelDto(unknown)` validate data from
other callers and persistence before use. Invalid input throws a stable
`MODEL_DTO_INVALID` error without embedding imported content in its message.

Version 1 covers model identity, element and relationship identity/type/name,
relationship endpoint IDs (including relationships as endpoints), views,
nested element/container/label nodes, semantic and presentation connections,
bounds, waypoints, fill/stroke/line-width overrides, and diagnostics. Free
presentation lines and their optional node endpoints remain representable.
Serialization uses a fixed field order and copies only DTO fields; references
are IDs rather than parser or diagram objects. The projection emits a
`DTO_UNSUPPORTED_FIELDS` warning for detected data outside this subset,
including properties, metadata, viewpoints, and authored font overrides.
Diagnostic messages are content-free to avoid copying model text into logs.

This is an opt-in internal boundary, **not yet a replacement for the public
import/export path**. Remaining issue #92 work includes migrating the legacy
public importer and exporter to TypeScript under ADR-0004, wiring both and
editor persistence through this contract, defining lossless representation
for currently omitted exchange fields and language-version semantics, and
testing real save/export and reload. Consumers must inspect diagnostics and
must not export a projected DTO with unsupported fields as a lossless MEFF
round trip. The synthetic MEFF fixture exercises the current supported subset.
