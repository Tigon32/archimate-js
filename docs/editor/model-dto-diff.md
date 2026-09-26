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
while the names differ. Candidates contain only the old ID, new ID, a fixed
reason code, `heuristic: true`, and a numeric confidence. The optional field is
omitted when no candidate exists. Candidates never replace the ID-based
add/remove records or change identity matching; duplicate fingerprints and
edited content remain ordinary additions/removals. The CLI shows non-empty
candidate lists in human output and includes them in JSON output.

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
non-canonical data. Diagnostics include a count plus content-free `details`:
projection diagnostic codes or DTO field paths/construct markers such as
`/organizations`, `/views/viewpoint`, or `/elements/0/[symbol]`; they never
include field values, model names, documentation, local paths, or parser source
messages. Invalid DTOs still raise `MODEL_DTO_INVALID`. `diffModelDto` keeps
its existing lossless-only behavior and `MODEL_DTO_DIFF_INELIGIBLE` error
contract.

The CLI exposes this comparison as `archimate-js diff <before.xml> <after.xml>
[--format json|human]`. Human output is the default; both formats go to stdout
and write no files. JSON includes before/after DTO values, while human output
includes stable entity IDs and changed field names. Explicit diff output can
reveal model names, labels, documentation, or other values in the supported DTO
subset, so only send it to destinations allowed to receive that model data.

This API compares concept properties that are present in the DTO, but it does
not preserve or compare organization trees, model metadata, viewpoint catalog
metadata, diagram-level properties, presentation-only constructs outside the
DTO subset, extension records, or unparsed exchange fields. Eligibility
diagnostics list those unsupported constructs when they are detected so callers
do not mistake the supported subset for a complete model comparison. It does
not infer relationship, view, or connection renames.

`renderModelDtoDiffOverlay(before, after, viewId)` returns a standalone
transparent SVG layer for one view. It marks added, removed, and modified node
and connection geometry, showing both outlines when geometry moved or was
rerouted. Semantic element and relationship changes also mark their instances
in that view. The overlay uses generic accessible labels and serializes no
model IDs, names, documentation, or DTO records. It does not render unchanged
model geometry; compose it over a separately rendered view. Both snapshots
must satisfy the same lossless diff eligibility boundary as `diffModelDto`.

`archimate-js diff-overlay <before.xml> <after.xml> (--view-id <id> |
--view-name <name>) --output <view.svg>` renders the after snapshot through the
existing browser renderer and embeds the deterministic overlay SVG into that
export. Added/removed/changed marks are not color-only: removed and before
geometry use dashed patterns, moved/rerouted geometry emits separate before and
after outlines, and each mark has an `aria-label` naming the change kind,
diagram entity, and before/after state. The exported SVG can reveal ordinary
rendered diagram labels from the after model, so handle it as model data.

The runtime-sensitive synthetic large-model budget is documented in
`test/performance/dto-diff-contract.mts`: the large tier contains 5,000
elements, 4,999 relationships, 5,000 nodes, and 4,999 connections. The
advisory budget is 350 ms median per scenario; the CI-noise hard limit is
2,000 ms. `test/unit/model-dto-diff-performance.test.mts` fails when the
large representative scenario exceeds the hard limit, and
`npm run test:performance:dto-diff` writes the content-free benchmark artifact.
