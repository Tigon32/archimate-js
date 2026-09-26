import { validateRelationshipSemantics } from '../../dist/language/relationship-semantics.mjs';
import type {
  RelationshipEndpointKind,
  RelationshipSemanticResult
} from '../../dist/language/relationship-semantics.mjs';

export function decideRelationshipSemantics(sourceType: string, relationshipType: string,
  targetType: string, sourceKind: RelationshipEndpointKind = 'element',
  targetKind: RelationshipEndpointKind = 'element'): RelationshipSemanticResult {
  return validateRelationshipSemantics({
    sourceType,
    relationshipType,
    targetType,
    sourceKind,
    targetKind
  });
}
