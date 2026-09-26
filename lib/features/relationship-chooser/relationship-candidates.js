import { decideRelationshipSemantics } from '../../util/RelationshipSemanticsAdapter';

const RELATIONSHIP_TYPES = [
  'Specialization', 'Composition', 'Aggregation', 'Assignment', 'Realization',
  'Serving', 'Access', 'Influence', 'Triggering', 'Flow', 'Association'
];

export function getReviewedRelationshipCandidates(sourceType, targetType) {
  return RELATIONSHIP_TYPES.filter((type) =>
    decideRelationshipSemantics(sourceType, type, targetType).decision === 'allowed');
}
