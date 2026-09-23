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

XML preflight returns these fixed, content-free warnings when it recognizes exchange
records that the importer does not reconstruct. Codes are deduplicated and sorted
lexicographically, so the same input yields the same ordered list.

| Code | Trigger | Current behavior |
|---|---|---|
| `MEFF_ELEMENTS_UNSUPPORTED` | An `elements/element` record | Model element records are not reconstructed. |
| `MEFF_RELATIONSHIPS_UNSUPPORTED` | A `relationships/relationship` record | Relationship records are not fully reconstructed. |
| `MEFF_MODEL_METADATA_UNSUPPORTED` | Model `metadata`, `organizations`, `properties`, or `propertyDefinitions` | These model-level records are not reconstructed. |
| `MEFF_VIEWS_UNSUPPORTED` | A `views/view` record | Exchange view records are not reconstructed. |
| `MEFF_DIAGRAMS_UNSUPPORTED` | A `node`, `connection`, or `label` under a view | Exchange diagram records are not reconstructed. |
| `MEFF_EXTENSIONS_UNSUPPORTED` | An element in a namespace outside the MEFF ArchiMate namespace | Extension content is not reconstructed. |

All are `warning` diagnostics at stage `parse`. Messages do not include source
XML, model names, identifiers, extension namespace URIs, or parser text. These
checks recognize a bounded set of common MEFF structures; they are not schema
validation and do not prove every unknown record has been detected. The package
does not currently provide a MEFF XML exporter, so no export-omission diagnostic
is emitted. Add those diagnostics with the supported-subset exporter tracked by
[#59](https://github.com/Tigon32/archimate-js/issues/59).

## Related issues

- #10
- #11
- #12
- #13
