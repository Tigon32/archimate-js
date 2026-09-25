# Editable Model DTO profile

`archimate-js/model-dto` exposes a lossless editable profile for model identity,
concept names and documentation, explicitly defined concept properties, and
the already-supported Diagram presentation subset. Concept properties are
attached to elements or relationships through a `propertyDefinitionId`; values
are ordered strings with an optional language tag. Property definitions support
the MEFF scalar types `string`, `boolean`, `integer`, and `real`.

The `concept-name`, `concept-documentation`, and `property` editor commands are
undoable and redoable. The existing `label` command remains presentation-only:
it changes a node or connection label and never changes the referenced
ArchiMate concept name. Property edits require an existing definition and
preserve each value and language in MEFF export/import.

Property DTO fields are optional. Models without properties retain their
existing version 1 DTO shape. Model-level properties, localized concept names
or documentation, property-definition localization, organizations, metadata,
viewpoints, and unsupported presentation or MEFF fields remain outside this
profile. Such imports are ineligible for editing rather than exported with
those fields silently dropped. Authored Diagram geometry and supported styles
remain part of the round-trip profile.

The `SYNTHETIC` fixture `test/fixtures/synthetic/dto-editable-profile.xml` is
hand-authored from public MEFF 3.1 record forms; it contains no real model or
project data.
