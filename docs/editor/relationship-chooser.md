# Relationship chooser and quick-create

The EE-M10 relationship workflow evaluates element-to-element candidates with
`validateRelationshipSemantics`. It uses the reviewed, versioned 23-row
profile only; missing tuples are **unsupported**, not invalid, and this feature
does not claim complete ArchiMate conformance. Profile expansion and
cross-consumer convergence remain tracked by [#102](https://github.com/Tigon32/archimate-js/issues/102).
The current profile limitations are listed in
[`docs/standards/supported-semantics-profile.md`](../standards/supported-semantics-profile.md).

## Choosing a relationship

Candidates are evaluated in the displayed source-to-target direction. A
single allowed candidate is selected automatically. Multiple allowed
candidates open an accessible chooser with a searchable list, visible focus,
keyboard navigation, Escape cancellation, focus restoration, and a live result
count. The chooser never changes direction and never substitutes Association
when a candidate is unsupported or rejected.

When no candidate is allowed, the feedback distinguishes known disallowed
rows from unsupported combinations. The DTO editor remains the final
authority: an unsupported tuple reaches its structured
`DTO_RELATIONSHIP_UNSUPPORTED` diagnostic without mutating the model or
history. Structural relationship endpoints and line/note connections are
handled separately and are not offered as normal element-to-element choices.

The existing direct drag gesture, connection popup, and static palette remain
available as secondary workflows. The legacy rule adapter supplies reviewed
allowed candidates while DTO commands perform persistent edits.

## Quick-create

Dragging a connector from an element to empty canvas can use the searchable
concept registry to find compatible element targets. After a concept is
chosen, the editor executes the existing `create-element` and
`create-relationship` commands with deterministic IDs, then starts semantic
name editing on the new target. No renderer shape or duplicate relationship
table is creation authority.

Creation and relationship insertion are two existing undoable command
boundaries, not a new transaction framework. Each command validates
atomically. A cancelled or rejected relationship choice must not leave an
orphan target; integrations should stage the target after relationship
selection or undo the already-created target before returning focus.
