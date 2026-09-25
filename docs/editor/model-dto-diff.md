# Headless DTO diff

`diffModelDto(before, after)` from `archimate-js/model-dto` compares two
version 1 `ModelDto` snapshots by stable IDs. It does not use Git, mutate its
inputs, or write logs. The returned JSON contains ordered `changes` and
`impactedViewIds`. Each change has a `semantic` or `presentation` area,
`added`, `removed`, or `modified` kind, entity and ID, changed field names,
and detached before/after values. Node and connection changes include `viewId`.
Collection order is ignored; waypoint order remains meaningful.

The result also contains `renameCandidates`, an advisory list for unique
element pairs whose canonical content matches after excluding ID and name,
while the names differ. Candidates contain only the old ID, new ID, and a
fixed reason code. The optional field is omitted when no candidate exists.
Candidates never replace the ID-based add/remove records or change identity
matching; duplicate fingerprints and edited content remain ordinary
additions/removals. The CLI shows non-empty candidate lists in human output and
includes them in JSON output.

Semantic changes cover the model name, elements, and relationships.
Presentation changes cover view names, node instances (including parent and
bounds), and connections (including waypoints and styles). A changed element
impacts every view containing any of its instances. A changed relationship
impacts every view containing one of its connections.

The comparison requires the supported, lossless DTO subset. Either input with
projection diagnostics or data omitted/normalized by `validateModelDto`
throws a content-free `MODEL_DTO_DIFF_INELIGIBLE` error. Invalid DTOs retain
`MODEL_DTO_INVALID`. Callers should decide whether to display returned names,
documentation, and labels; the diff itself does not log them.

Call `assessModelDtoDiffEligibility(before, after)` to inspect this boundary
before requesting a diff. It returns a deterministic `eligible` flag and
content-free diagnostics attributed to `before` or `after`. Stable codes
distinguish lossy projection diagnostics, unsupported fields, and other
non-canonical data; each diagnostic includes only a count, never field names,
values, or source diagnostic messages. Invalid DTOs still raise
`MODEL_DTO_INVALID`. `diffModelDto` keeps its existing lossless-only behavior
and `MODEL_DTO_DIFF_INELIGIBLE` error contract.

The CLI exposes this comparison as `archimate-js diff <before.xml> <after.xml>
[--format json|human]`. Human output is the default; both formats go to stdout
and write no files. JSON includes before/after DTO values, while human output
includes stable entity IDs and changed field names. Explicit diff output can
reveal model names, labels, documentation, or other values in the supported DTO
subset, so only send it to destinations allowed to receive that model data.

This API does not compare organization, properties, viewpoint metadata, or
unparsed exchange fields. Eligibility diagnostics prevent callers from
mistaking such snapshots for complete comparisons, but do not preserve or diff
the unsupported data. It does not infer relationship, view, or connection
renames or impose a large-model performance budget. Those remain in the
[comparison umbrella](https://github.com/Tigon32/archimate-js/issues/105).

`renderModelDtoDiffOverlay(before, after, viewId)` returns a standalone
transparent SVG layer for one view. It marks added, removed, and modified node
and connection geometry, showing both outlines when geometry moved or was
rerouted. Semantic element and relationship changes also mark their instances
in that view. The overlay uses generic accessible labels and serializes no
model IDs, names, documentation, or DTO records. It does not render unchanged
model geometry; compose it over a separately rendered view. Both snapshots
must satisfy the same lossless diff eligibility boundary as `diffModelDto`.
