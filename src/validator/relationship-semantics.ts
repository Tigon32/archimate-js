/** Validator public API facade over the one language decision service. */
export { RELATIONSHIP_SEMANTICS_VERSION, RELATIONSHIP_SEMANTIC_ROWS, validateRelationshipSemantics }
  from '../language/relationship-semantics.mjs';
export type { RelationshipSemanticDecision, RelationshipSemanticRow, RelationshipEndpointKind,
  RelationshipSemanticInput, RelationshipSemanticResult } from '../language/relationship-semantics.mjs';
