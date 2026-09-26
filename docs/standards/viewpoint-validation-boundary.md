# Application-owned viewpoint validation boundary

`validateViewpoint` applies a caller-supplied profile to one selected,
validated `ModelDto` view. It does not ship a viewpoint catalog, interpret
MEFF viewpoint metadata as rules, or claim ArchiMate viewpoint conformance.

Profiles declare their supported viewpoint identifiers and deterministic
`require-element-type` or `exclude-element-type` rules. A result is
`unsupported` when the requested profile is absent or marked unsupported, or
when that profile does not list the requested viewpoint. Invalid DTO input is
reported separately. Findings contain profile/rule codes, affected DTO IDs,
severity, and caller-authored action text; consumers should render that text
as text, not markup.

The supported API boundary means only that the caller supplied a profile that
declares support for an identifier. It is not evidence that the identifier or
rule agrees with a standard. Profiles and their rule sources remain the
caller's responsibility. Tests use a hand-authored `SYNTHETIC` profile and DTO
only; no specification tables, private catalogs, or real architecture models
are bundled.

## Evidence and limits

The [MEFF diagram import boundary](meff-diagram-import.md#viewpoint-metadata)
records that imported viewpoint metadata is preserved but does not enforce
constraints on view contents. The [validator profile](validator-profile.md)
also lists viewpoint/profile semantics as unsupported. The Open Group's
[licensed ArchiMate resources](https://www.opengroup.org/archimate-licensed-downloads)
remain the normative authority; this API includes no rules transcribed from
those materials. It makes no claim of standards conformance, completeness, or
validation of MEFF viewpoint definitions.
