/**
 * Pure tri-state relationship decision service over reviewed language rows.
 */

import {
  RELATIONSHIP_SEMANTICS_VERSION,
  RELATIONSHIP_SEMANTIC_ROWS
} from '../language/relationship-decisions.mjs';
import type { RelationshipSemanticDecision } from '../language/relationship-decisions.mjs';

export { RELATIONSHIP_SEMANTICS_VERSION, RELATIONSHIP_SEMANTIC_ROWS } from '../language/relationship-decisions.mjs';
export type { RelationshipSemanticDecision, RelationshipSemanticRow } from '../language/relationship-decisions.mjs';

export type RelationshipEndpointKind = 'element' | 'relationship' | 'junction';

export interface RelationshipSemanticInput {
  sourceType: string;
  relationshipType: string;
  targetType: string;
  sourceKind?: RelationshipEndpointKind;
  targetKind?: RelationshipEndpointKind;
  archimateVersion?: string;
}

export interface RelationshipSemanticResult {
  archimateVersion: string;
  decision: RelationshipSemanticDecision;
  reasonCode:
    | 'MATRIX_ALLOWED'
    | 'MATRIX_DISALLOWED'
    | 'VERSION_UNSUPPORTED'
    | 'JUNCTION_UNSUPPORTED'
    | 'RELATIONSHIP_ENDPOINT_UNSUPPORTED'
    | 'COMBINATION_UNSUPPORTED';
  evidenceSourceId?: 'opengroup-archimate-3.2-reference-cards';
  /** Independently authored interpretation of the reviewed row, when matched. */
  interpretation?: string;
}

function bareType(value: string): string {
  const colon = value.lastIndexOf(':');
  return colon === -1 ? value : value.slice(colon + 1);
}

function isJunctionType(value: string): boolean {
  return value === 'Junction' || value === 'AndJunction' || value === 'OrJunction';
}

/**
 * Decide one source/relationship/target combination without I/O or mutation.
 */
export function validateRelationshipSemantics(input: RelationshipSemanticInput): RelationshipSemanticResult {
  const archimateVersion = input.archimateVersion ?? RELATIONSHIP_SEMANTICS_VERSION;
  if (archimateVersion !== RELATIONSHIP_SEMANTICS_VERSION) {
    return { archimateVersion, decision: 'unsupported', reasonCode: 'VERSION_UNSUPPORTED' };
  }

  const sourceType = bareType(input.sourceType);
  const relationshipType = bareType(input.relationshipType);
  const targetType = bareType(input.targetType);
  const sourceKind = input.sourceKind ?? 'element';
  const targetKind = input.targetKind ?? 'element';

  if (sourceKind === 'junction' || targetKind === 'junction' || isJunctionType(sourceType) || isJunctionType(targetType)) {
    return { archimateVersion, decision: 'unsupported', reasonCode: 'JUNCTION_UNSUPPORTED' };
  }
  if (sourceKind === 'relationship' || targetKind === 'relationship') {
    return { archimateVersion, decision: 'unsupported', reasonCode: 'RELATIONSHIP_ENDPOINT_UNSUPPORTED' };
  }

  const row = RELATIONSHIP_SEMANTIC_ROWS.find((candidate) =>
    candidate.sourceType === sourceType &&
    candidate.relationshipType === relationshipType &&
    candidate.targetType === targetType
  );
  if (!row) {
    return { archimateVersion, decision: 'unsupported', reasonCode: 'COMBINATION_UNSUPPORTED' };
  }
  return {
    archimateVersion,
    decision: row.decision,
    reasonCode: row.decision === 'allowed' ? 'MATRIX_ALLOWED' : 'MATRIX_DISALLOWED',
    evidenceSourceId: row.evidenceSourceId,
    interpretation: row.interpretation
  };
}
