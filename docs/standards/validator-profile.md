# Validator profile (initial)

The standalone TypeScript API is exposed as `archimate-js/validator`. It processes XML locally and performs bounded well-formedness checks, a conservative structural subset, identifier/reference checks, basic relationship vocabulary checks, and optional caller-supplied quality rules.

## Stages

1. **Safe XML:** limits input bytes, nesting, element count, and attributes; rejects DTDs so document-defined entities cannot expand. Parser errors have stable codes and never include source excerpts.
2. **Schema subset:** checks the model root, required identity, concept identifiers, and required relationship endpoints. This subset is not The Open Group XSD and does not prove exchange-format validity.
3. **Structure and references:** detects duplicate IDs and unresolved model/view references. Diagnostics are sorted by layer, code, subject ID, and source position.
4. **Standard semantics:** targets ArchiMate 3.2 and recognizes the current core element and relationship vocabularies. It reports unknown types and explicitly marks junction and relationship-to-relationship coverage as incomplete. It does not derive semantic truth from editor menu maps, and it does not yet implement a complete normative source/relationship/target matrix.
5. **Organization quality:** optional synchronous rules inspect a read-only summary. Exceptions are replaced with a generic diagnostic. No organization-specific terms or rules are bundled.

The result includes review suggestions only. `validateArchimateXml` never mutates XML or the parsed model. Suggestions have stable codes and descriptive operations; callers decide whether to apply any repair. To limit accidental disclosure, subject identifiers are omitted from diagnostics and suggestions by default, and the model summary is not returned unless `includeSummary: true` is explicitly set. Organization rules receive the bounded in-memory summary only when the caller supplies those rules.

## Limits and security

Defaults are 1 MiB of UTF-8 XML, 64 nested elements, 25,000 XML nodes, and 64 attributes per element. These are configurable per caller. The validator makes no network requests and does not log XML, model values, parser exception messages, or organization rule exceptions.

## Authority and interoperability

The Open Group ArchiMate Specification is normative for language semantics. The Open Group identifies 3.2 as the latest specification version on its [licensed-downloads page](https://www.opengroup.org/archimate-licensed-downloads). Its [Model Exchange File Format materials](https://www.opengroup.org/open-group-archimate-model-exchange-file-format) and schema artifacts are the authority for exchange shape; official schema files are not bundled here because redistribution terms have not been established. The built-in checks are intentionally described as a subset, not XSD validation or conformance.

Archi may be used to import/export the synthetic fixtures as a behavioral interoperability check. Differences are recorded as compatibility findings and do not override The Open Group material. No GPL implementation is copied into this MIT project; new validator code and its direct parser dependency use permissive licensing.
