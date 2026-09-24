# Structured diagnostics plan

Import, validation, and exchange behavior should produce stable diagnostics that can be tested and consumed by report-generation tooling.

## Diagnostic shape

```json
{
  "code": "ARCHIMATE_RELATIONSHIP_NOT_ALLOWED",
  "severity": "error",
  "message": "Relationship type is not allowed between source and target concepts.",
  "conceptId": "synthetic-id-or-null",
  "source": "relationship-validation",
  "privatePayloadIncluded": false
}
```

## Requirements

- No diagnostic may include full XML, full model objects, hostnames, environment names, credentials, or private payloads.
- Codes must be stable across runs.
- Diagnostics must be useful for both CLI validation and embedded HTML reports.
- Human text may change; code and source should remain stable.

## Initial code families

| Code family | Purpose |
|---|---|
| `ARCHIMATE_PARSE_*` | XML/model parse failures |
| `ARCHIMATE_IMPORT_*` | View import and render failures |
| `ARCHIMATE_RELATIONSHIP_*` | Relationship matrix validation |
| `ARCHIMATE_EXCHANGE_*` | Model Exchange Format compatibility |
| `ARCHIMATE_RENDER_*` | SVG/report rendering |

## Current MEFF import warnings

MEFF import returns fixed, content-free warnings for recognized records and fields
outside the currently reconstructed subset. Codes are deduplicated and sorted
lexicographically, so the same input yields the same ordered list.

| Code | Trigger | Current behavior |
|---|---|---|
| `MEFF_ELEMENTS_UNSUPPORTED` | Legacy/parser-probe element records outside the supported MEFF Model-core path | Schema-valid Model-core element records are reconstructed; unsupported element forms remain warnings. |
| `MEFF_RELATIONSHIPS_UNSUPPORTED` | Legacy/parser-probe relationship records outside the supported MEFF Model-core path | Schema-valid Model-core relationship records are reconstructed with endpoint references; unsupported relationship forms remain warnings. |
| `MEFF_MODEL_METADATA_UNSUPPORTED` | Unrecognized children within Model metadata, organizations, properties, or definitions | Supported Model records are reconstructed; unrecognized subfields remain warnings. |
| `MEFF_VIEWS_UNSUPPORTED` | A View structure outside the supported Diagram subset, or unreadable View data | That view data is skipped. |
| `MEFF_VIEWPOINT_FIELD_UNSUPPORTED` | Viewpoint concern or modeling note outside the declared metadata profile | The unsupported field is skipped. |
| `IMPORT_VIEWPOINT_REFERENCE_UNRESOLVED` | A Diagram view references a missing viewpoint definition | Literal reference is retained without a resolved identifier. |
| `MEFF_DIAGRAMS_UNSUPPORTED` | A Diagram field outside the supported projection | That field is skipped; supported records in the same Diagram remain importable. |
| `MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED` | A concrete node type other than Element, Container, or Label | The node is skipped. |
| `MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED` | A concrete connection type other than Relationship or Line | The connection is skipped. |
| `MEFF_EXTENSIONS_UNSUPPORTED` | An element in a namespace outside the MEFF ArchiMate namespace | Extension content is not reconstructed. |

All are `warning` diagnostics at stage `parse`. Messages do not include source
XML, model names, identifiers, extension namespace URIs, or parser text. These
checks recognize a bounded set of common MEFF structures; they are not schema
validation and do not prove every unknown record has been detected. The current
supported View/Diagram subset maps named Diagram views, viewpoint metadata,
Element/Container/Label nodes, Relationship/Line connections, authored geometry,
local labels/documentation, view-level properties, and supported styles to the
view tree. See [the declared profile](meff-diagram-import.md) for rendering
limits and unsupported nested viewpoint structures.
The package does not currently provide a MEFF XML exporter, so no
export-omission diagnostic is emitted. Add those diagnostics with the
supported-subset exporter tracked by [#59](https://github.com/Tigon32/archimate-js/issues/59).

## Related issues

- #10
- #11
- #12
- #13
