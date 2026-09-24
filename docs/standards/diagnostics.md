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
| `MEFF_VIEWS_UNSUPPORTED` | A View/Viewpoint structure outside the supported Diagram subset, or unreadable View data | That view data is skipped. |
| `MEFF_DIAGRAMS_UNSUPPORTED` | A non-Element node, non-Relationship connection, or unsupported style/label/documentation/drill-down field | That record or field is skipped; supported records in the same Diagram remain importable. |
| `MEFF_EXTENSIONS_UNSUPPORTED` | An element in a namespace outside the MEFF ArchiMate namespace | Extension content is not reconstructed. |

All are `warning` diagnostics at stage `parse`. Messages do not include source
XML, model names, identifiers, extension namespace URIs, or parser text. These
checks recognize a bounded set of common MEFF structures; they are not schema
validation and do not prove every unknown record has been detected. The current
supported View/Diagram subset maps named Diagram views, nested Element nodes,
Relationship connections, diagram-space geometry, source/target attachments,
bendpoints, supported style fields, relationship labels, and connection line
width to the existing view tree and renderer. Full Diagram fidelity remains
outside this subset; local Diagram annotations are tracked by
[#75](https://github.com/Tigon32/archimate-js/issues/75), additional
presentation records by [#76](https://github.com/Tigon32/archimate-js/issues/76),
and Viewpoint metadata by [#77](https://github.com/Tigon32/archimate-js/issues/77).
The package does not currently provide a MEFF XML exporter, so no
export-omission diagnostic is emitted. Add those diagnostics with the
supported-subset exporter tracked by [#59](https://github.com/Tigon32/archimate-js/issues/59).

## Related issues

- #10
- #11
- #12
- #13
