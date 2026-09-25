# Headless DTO diff

`diffModelDto(before, after)` from `archimate-js/model-dto` compares two
version 1 `ModelDto` snapshots by stable IDs. It does not use Git, mutate its
inputs, or write logs. The returned JSON contains ordered `changes` and
`impactedViewIds`. Each change has a `semantic` or `presentation` area,
`added`, `removed`, or `modified` kind, entity and ID, changed field names,
and detached before/after values. Node and connection changes include `viewId`.
Collection order is ignored; waypoint order remains meaningful.

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

The CLI exposes this comparison as `archimate-js diff <before.xml> <after.xml>
[--format json|human]`. Human output is the default; both formats go to stdout
and write no files. JSON includes before/after DTO values, while human output
includes stable entity IDs and changed field names. Explicit diff output can
reveal model names, labels, documentation, or other values in the supported DTO
subset, so only send it to destinations allowed to receive that model data.

This API does not compare organization, properties, viewpoint metadata, or
unparsed exchange fields. It does not infer renames when IDs change, render a
visual overlay, or impose a large-model performance budget. Those remain in
the [comparison umbrella](https://github.com/Tigon32/archimate-js/issues/105).
