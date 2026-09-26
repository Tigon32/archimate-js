# Selection productivity interactions

EE-M11 adds a small adapter-owned toolbar for eligible DTO-backed Modeler
sessions. It appears only while one or more canvas items are selected and
offers duplicate, six alignment actions, horizontal/vertical distribution,
and delete. The existing diagram-js context pad remains the connector-handle
implementation; application code does not receive diagram-js elements or
events.

The public Modeler operations are:

```ts
modeler.duplicateSelection({ x: 20, y: 20 });
modeler.alignSelection('left');
modeler.distributeSelection('horizontal');
modeler.deleteSelection();
```

`duplicateSelection` clones selected ArchiMate semantic elements rather than
creating another presentation of the same semantic identity. Within the
eligible DTO/MEFF editing subset, selected element-node roots include their
descendant element nodes. A selection whose hierarchy includes a container or
label emits no duplicate command; duplication of non-element presentations
remains tied to broader MEFF/DTO convergence work. Relationships whose two
view endpoints are both duplicated are cloned with remapped endpoints;
multiple view connections can share one cloned relationship. The command
payload contains deterministic caller-generated IDs and commits the complete
semantic/view change as one `duplicate-selection` operation. Validation failure
or cancellation commits nothing.

Holding Alt/Option while dragging a selected shape invokes the same duplicate
operation with the drag delta and prevents the original nodes from moving.
Alignment and distribution compute absolute diagram coordinates and reuse the
existing `move-many` command, so they remain one undoable view-geometry change.
Delete uses `delete-many`. These commands are replayable through the existing
version-1 operation log and never persist diagram-js canvas objects.

## Minimap decision

EE-M11 defers a runtime minimap dependency. The public evidence in
[`minimap-license-and-provenance.md`](../research/minimap-license-and-provenance.md)
shows `diagram-js-minimap` is a plausible MIT-licensed candidate, but adopting
it still requires runtime compatibility, ArchiMate rendering, CSS/theming, and
package-notice verification. The productivity milestone does not need that
dependency to satisfy navigation or editing correctness, and a minimap remains
optional. Reconsider adoption with the application-shell integration, where
the overview placement and theme contract can be tested in its final host.
