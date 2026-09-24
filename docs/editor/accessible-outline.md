# Accessible outline data for one view

`archimate-js/model-dto` exports `createAccessibleOutline`,
`searchAccessibleOutline`, and `formatAccessibleOutline`. They work on the validated, versioned `ModelDto`
without a browser, diagram-js, or an editor session. This is a headless data
contract for an equivalent text representation of a selected view; it does not
create a tree widget or change a diagram's selection.

```ts
import { createAccessibleOutline, formatAccessibleOutline,
  searchAccessibleOutline } from 'archimate-js/model-dto';

const outline = createAccessibleOutline(modelDto, 'view-one', {
  grouping: 'containment',
  includeRelationships: true,
  includeDocumentation: false
});
const reportText = formatAccessibleOutline(outline);
const matches = searchAccessibleOutline(outline, 'ApplicationComponent');
```

The result contains `viewId`, `viewName`, `grouping`, ordered `nodes`, and
ordered `relationships`. Each node has a **view instance ID**, `kind`, semantic
`type`, display `name`, `children`, and incoming/outgoing connection ID lists.
A relationship has a view connection ID, `kind`, `type`, display `name`, and
optional source/target view node IDs. Repeated names or repeated appearances of
one concept remain separate instances. Container children follow the DTO's
preorder; `grouping: 'flat'` returns those instances in one traversal list.
Search matches visible names or semantic types, case-insensitively, after
trimming the query. It returns nodes in preorder followed by relationships in
view order. Results include a view instance ID, kind, type, name, and `pathIds`
from the outermost container through a node; relationships have an empty path.
Flat outlines have no retained containment, so each node path contains only
its own ID. An empty query is rejected, and no match returns an empty array.
Search does not inspect documentation or any model content excluded from the
selected-view outline.

The default options are containment, relationships included, and documentation
excluded. A view-specific label takes precedence over a concept name. Unnamed
items and missing endpoints use readable fallbacks. Relationship references
identify the corresponding view nodes; callers can use those IDs to build a
search or navigation UI. When relationships are omitted, connection records
and each node's incoming/outgoing lists are empty. Documentation is copied
only with `includeDocumentation: true`, and only for elements or relationships
shown in the selected view. The outline omits unselected views, unrelated
concepts, DTO diagnostics, geometry, and importer-only fields such as
`xpathPart`.

Invalid DTOs fail with `MODEL_DTO_INVALID`; an unknown view ID fails with
`ACCESSIBLE_OUTLINE_VIEW_NOT_FOUND`. Error messages do not include source
content. Output is detached from the DTO, and the text report is plain text.
Render names and documentation in a future HTML outline with `textContent`
rather than injecting them as HTML.

The SVG export's semantic roles/names are covered by #159. #104 still owns the
browser outline, keyboard traversal, focus/selection synchronization with the
canvas, and screen-reader verification. Static reports should offer the text
outline alongside the SVG when users need more detail than the SVG description.
