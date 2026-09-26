/**
 * Pure tri-state relationship decision service over reviewed language rows.
 */

import {
  RELATIONSHIP_SEMANTICS_VERSION,
  RELATIONSHIP_SEMANTIC_ROWS
} from './relationship-decisions.mjs';
import type { RelationshipSemanticDecision } from './relationship-decisions.mjs';
import type { SemanticProfile } from './semantic-profile.mjs';

export { RELATIONSHIP_SEMANTICS_VERSION, RELATIONSHIP_SEMANTIC_ROWS } from './relationship-decisions.mjs';
export type { RelationshipSemanticDecision, RelationshipSemanticRow } from './relationship-decisions.mjs';
export { parseSemanticProfile } from './semantic-profile.mjs';
export type { SemanticProfile, SemanticProfileKind, SemanticProfileRow } from './semantic-profile.mjs';

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
  decisionLayer: 'core' | string;
  reasonCode:
    | 'MATRIX_ALLOWED'
    | 'MATRIX_DISALLOWED'
    | 'PROFILE_ALLOWED'
    | 'PROFILE_DISALLOWED'
    | 'VERSION_UNSUPPORTED'
    | 'JUNCTION_UNSUPPORTED'
    | 'RELATIONSHIP_ENDPOINT_UNSUPPORTED'
    | 'COMBINATION_UNSUPPORTED';
  evidenceSourceId?: string;
  nonNormative?: true;
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
export function validateRelationshipSemantics(input: RelationshipSemanticInput,
  profile?: SemanticProfile): RelationshipSemanticResult {
  const archimateVersion = input.archimateVersion ?? RELATIONSHIP_SEMANTICS_VERSION;
  if (archimateVersion !== RELATIONSHIP_SEMANTICS_VERSION) {
    return { archimateVersion, decision: 'unsupported', decisionLayer: 'core',
      reasonCode: 'VERSION_UNSUPPORTED' };
  }

  const sourceType = bareType(input.sourceType);
  // MEFF/DTO names use "Serving" while reviewed registry rows use "ServingRelationship".
  const relationshipName = bareType(input.relationshipType);
  const relationshipType = relationshipName.endsWith('Relationship') ? relationshipName :
    `${relationshipName}Relationship`;
  const targetType = bareType(input.targetType);
  const sourceKind = input.sourceKind ?? 'element';
  const targetKind = input.targetKind ?? 'element';

  if (sourceKind === 'junction' || targetKind === 'junction' || isJunctionType(sourceType) || isJunctionType(targetType)) {
    return { archimateVersion, decision: 'unsupported', decisionLayer: 'core',
      reasonCode: 'JUNCTION_UNSUPPORTED' };
  }
  if (sourceKind === 'relationship' || targetKind === 'relationship') {
    return { archimateVersion, decision: 'unsupported', decisionLayer: 'core',
      reasonCode: 'RELATIONSHIP_ENDPOINT_UNSUPPORTED' };
  }

  const row = RELATIONSHIP_SEMANTIC_ROWS.find((candidate) =>
    candidate.sourceType === sourceType &&
    candidate.relationshipType === relationshipType &&
    candidate.targetType === targetType
  );
  if (!row) return profileDecision(profile, archimateVersion, sourceType, relationshipType, targetType);
  return {
    archimateVersion,
    decision: row.decision,
    decisionLayer: 'core',
    reasonCode: row.decision === 'allowed' ? 'MATRIX_ALLOWED' : 'MATRIX_DISALLOWED',
    evidenceSourceId: row.evidenceSourceId,
    interpretation: row.interpretation
  };
}

function profileDecision(profile: SemanticProfile | undefined, archimateVersion: string,
  sourceType: string, relationshipType: string, targetType: string): RelationshipSemanticResult {
  if (!profile) {
    return { archimateVersion, decision: 'unsupported', decisionLayer: 'core',
      reasonCode: 'COMBINATION_UNSUPPORTED' };
  }
  const row = profile.rows.find((candidate) =>
    candidate.sourceType === sourceType &&
    candidate.relationshipType === relationshipType &&
    candidate.targetType === targetType
  );
  if (!row) {
    return { archimateVersion, decision: 'unsupported', decisionLayer: 'core',
      reasonCode: 'COMBINATION_UNSUPPORTED' };
  }
  return {
    archimateVersion,
    decision: row.decision,
    decisionLayer: profile.id,
    reasonCode: row.decision === 'allowed' ? 'PROFILE_ALLOWED' : 'PROFILE_DISALLOWED',
    evidenceSourceId: row.evidenceSourceId,
    nonNormative: true,
    interpretation: row.interpretation
  };
}
