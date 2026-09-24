# MEFF 3.1 Model import profile

The importer accepts the published MEFF 3.1 Model namespace (`http://www.opengroup.org/xsd/archimate/3.0/`). This profile describes preserved fields; validation against the [pinned Model XSD](meff-schema-validation.md) runs separately in CI. The Open Group's [Model schema documentation](https://www.opengroup.org/xsd/archimate/3.1/html-model/) is the public reference.

| XML record | Imported projection |
|---|---|
| `model/@identifier`, `@version`, names, documentation | `model.id`, `version`, `localizedNames`, `name`, `documentation` |
| `metadata/schema`, `schemaversion`, repeated `schemaInfo` | `model.metadata` object with strings and optional ordered `schemaInfo` array |
| `propertyDefinitions/propertyDefinition` | `model.propertyDefinitions` array of `{ id, type, localizedNames, name, documentation }`; `propertyDefinitionsById` lookup |
| Model, element, relationship `properties/property` | Ordered `.properties` array of `{ propertyDefinitionRef, propertyDefinition, values }`; `propertyDefinition` is the canonical definition object, and `values` retains ordered `{ language, value }` entries |
| Repeated `organizations/item` trees | `model.organizations` array of `{ items }`; each item retains `id`, `identifierRef`, localized labels, documentation, and nested `items`; `referencedConcept` points at the canonical element or relationship when the ID resolves |

Organization containment is a structural tree. It does not change element types, create ArchiMate relationships, or infer ownership semantics. Identifiers and references that cannot be resolved yield `IMPORT_REFERENCE_UNRESOLVED` without exposing input values. Unsupported Model record children yield `MEFF_MODEL_METADATA_UNSUPPORTED` or, for direct concept children, `MEFF_MODEL_FIELDS_UNSUPPORTED`. Foreign namespace content yields `MEFF_EXTENSIONS_UNSUPPORTED` in XML preflight. Diagnostics have fixed messages and do not include source XML.

The importer does not preserve arbitrary metadata extension payloads, foreign namespace attributes, or unrecognized Model fields. It does not perform XSD or ArchiMate semantic validation. `valid-model-records.xml` is a synthetic fixture validated by the pinned Model XSD in CI and checked by `meff-model-records.test.mjs`. This is a bounded import profile, not full MEFF conformance or certification.
