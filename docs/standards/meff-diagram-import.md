# MEFF Diagram import projection

This importer maps the supported MEFF 3.1 Diagram presentation subset into the internal view tree. It does not infer ArchiMate meaning from a connection's route.

## Geometry

MEFF node x/y/w/h values are retained without rounding in `businessObject.meffGeometry`. The projection records `coordinateSpace: "diagram"`; the schema defines x/y from the diagram's top-left origin, including for nested nodes, and does not name a physical unit.

The canvas stores contained shape positions relative to their parent. For a MEFF node, the importer computes:

```
canvas position = MEFF diagram position - accumulated parent canvas position
```

Adding the parent positions back reconstructs the imported diagram-space x/y. The original values remain on `meffGeometry`.

Connection geometry is retained in `meffGeometry` with separate `sourceAttachment`, ordered `bendpoints`, and `targetAttachment` fields. Each point has x/y, `kind`, and `coordinateSpace: "diagram"`. The renderer waypoint projection follows the same schema order and carries those points' kind metadata. Connection geometry does not change the referenced relationship or its source/target semantics.

## Styles

An explicit MEFF style is mapped field by field:

- line width remains the imported positive integer;
- line/fill/font colors retain numeric r/g/b values and the optional a percentage (0–100);
- font name, combined style tokens, and half-point size remain in the font record; size stays in points.

An omitted MEFF style remains omitted on the imported business object. The element factory applies its normal layer or connection defaults to the rendered shape, without writing those defaults back as imported MEFF values. Explicit style values are projected to the internal style object; current SVG rendering does not yet reproduce every MEFF font setting or connection line width.

## Unsupported records and version boundary

The Diagram projection preserves node and connection `localizedLabels` (ordered `{ language, value }` records), `meffDocumentation`, and literal `viewRefs`. Its `label` is the first local label and takes display precedence over the referenced semantic concept's name; the semantic name remains unchanged. Resolvable drill-down identifiers appear in `resolvedViewRefs` and do not affect semantic relationships. View documentation and schema-valid view-level properties are preserved separately as `meffDocumentation` and `meffProperties`.

The MEFF 3.1 Diagram schema has no local `properties` child on a node or connection and no bounds on a local `label` child. Property values belong to a view, semantic concept, or viewpoint in this profile. A separately authored `Label` node carries its own diagram-space geometry and local text. `Container` nodes retain geometry, style, local text, and nested presentation nodes without an `elementRef`. `Line` connections retain route and style without a `relationshipRef`. Lines without node endpoints remain in the projection; the canvas emits `IMPORT_PRESENTATION_LINE_UNRENDERED` rather than inventing anchors. Unknown concrete node and connection types produce precise `MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED` and `MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED` warnings. Diagnostic codes are sorted and deduplicated.

## Viewpoint metadata

The View projection stores definitions under `views.viewpoints.viewpointsList`. Each definition keeps its identifier, first and localized names, localized documentation, properties, `viewpointPurpose`, `viewpointContent`, and ordered `allowedElementTypes` and `allowedRelationshipTypes`. The allowed types are schema vocabulary names, not semantic concept instances. A Diagram view keeps literal `viewpoint` and `viewpointRef` attributes; `resolvedViewpointRef` contains the ID when a catalog definition exists. Missing definitions emit content-free `IMPORT_VIEWPOINT_REFERENCE_UNRESOLVED`. Concern and modeling note structures emit `MEFF_VIEWPOINT_FIELD_UNSUPPORTED` until their nested content is mapped. Viewpoint metadata does not enforce constraints on diagram elements or relationships.

Fixtures are validated against the repository's hash-pinned MEFF 3.1 schemas. The namespace remains `http://www.opengroup.org/xsd/archimate/3.0/`; schema version 3.1 and ArchiMate language version 3.2 are separate version identifiers. This is evidence for the tested MEFF 3.1 schema subset, not a claim of full MEFF, language conformance, or cross-tool interoperability. See [the schema validation record](meff-schema-validation.md) and [the research note](../research/okf/meff-view-diagram-implementation-research.md).
