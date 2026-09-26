// @ts-expect-error Generated legacy adapter has no declaration during migration.
import { decideRelationshipSemantics } from '../../util/RelationshipSemanticsAdapter.js';

const RELATIONSHIP_TYPES = [
  'Specialization', 'Composition', 'Aggregation', 'Assignment', 'Realization',
  'Serving', 'Access', 'Influence', 'Triggering', 'Flow', 'Association'
];

export function getReviewedRelationshipCandidates(sourceType: string, targetType: string): string[] {
  return RELATIONSHIP_TYPES.filter((type) =>
    decideRelationshipSemantics(sourceType, type, targetType).decision === 'allowed');
}
