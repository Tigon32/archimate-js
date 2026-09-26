# Relationship creation and quick-create

The DTO-backed `archimate-js/modeler` uses the shared relationship decision
service in `src/language/relationship-semantics.mts`; the reviewed matrix is a
conservative 23-row ArchiMate 3.2 subset, not a complete conformance profile.
The service's `allowed`, `disallowed`, and `unsupported` outcomes remain
distinct. An unsupported tuple is never treated as valid or as invalid solely
because the profile has no row.

When a connector gesture reaches a second element, the diagram-js adapter sends
the endpoint concept types to the Modeler facade. The facade defaults only
when exactly one reviewed relationship is allowed. Multiple choices open an
accessible, keyboard-operable chooser that shows source-to-target direction;
no allowed choices display explicit counts for disallowed and unsupported
types without creating a connection. The DTO command remains the final
validation authority. Reconnection retains the existing relationship type and
is validated by the same domain service.

Dropping a connector into empty canvas opens a compatible target picker. Its
options are derived from the concept registry and include only target concepts
with an allowed relationship from the source. Choosing an option creates the
semantic target, its view node, the semantic relationship, and the view
connection with one `create-related-element` editor command. This compound
command validates the complete candidate model before commit and is one undo
step. Canceling the picker commits nothing, so it cannot leave an orphan
concept. After creation, direct editing changes the target's semantic name.

The existing palette and legacy moddle editing path remain available. The
chooser and quick-create gesture are part of eligible DTO-backed editing
sessions; they do not claim new relationship coverage for imports outside the
reviewed subset. Structural connections to relationship/junction endpoints
and note/line interactions remain governed by their existing compatibility
behavior.

The adapter may use transient diagram-js connection previews and event data,
but the application command, model DTOs, operation log, MEFF export, semantic
validation, and view geometry do not persist diagram-js objects. Relationship
candidate generation and UI are private implementation details, not additional
public `Modeler` escape hatches.

Tests cover tri-state choice generation, defaulting, accessible chooser
selection and cancellation, adapter routing, one-step command undo/redo and
operation replay, atomic quick-create validation, MEFF round trips, and
Chromium flows for both relationship selection and drag-to-empty quick-create.
