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

## Related issues

- #10
- #11
- #12
- #13
