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

Labels, documentation, properties, drill-down references, viewpoints, and non-Element/Relationship diagram records remain outside this projection and receive stable, content-free diagnostics where detected. Diagnostic codes are sorted and deduplicated.

Fixtures are validated against the repository's hash-pinned MEFF 3.1 schemas. The namespace remains `http://www.opengroup.org/xsd/archimate/3.0/`; schema version 3.1 and ArchiMate language version 3.2 are separate version identifiers. This is evidence for the tested MEFF 3.1 schema subset, not a claim of full MEFF, language conformance, or cross-tool interoperability. See [the schema validation record](meff-schema-validation.md) and [the research note](../research/okf/meff-view-diagram-implementation-research.md).
