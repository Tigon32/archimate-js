/**
 * Conservative ArchiMate 3.2 relationship interpretations.
 *
 * This is deliberately a small, auditable set of independently authored
 * decisions. A missing row is unsupported rather than implicitly invalid.
 */

export const RELATIONSHIP_SEMANTICS_VERSION = '3.2' as const;

export type RelationshipEndpointKind = 'element' | 'relationship' | 'junction';
export type RelationshipSemanticDecision = 'allowed' | 'disallowed' | 'unsupported';

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

export interface RelationshipSemanticRow {
  archimateVersion: typeof RELATIONSHIP_SEMANTICS_VERSION;
  sourceType: string;
  relationshipType: string;
  targetType: string;
  decision: Exclude<RelationshipSemanticDecision, 'unsupported'>;
  evidenceSourceId: 'opengroup-archimate-3.2-reference-cards';
  interpretation?: string;
}

/**
 * Public-source interpretations used by this package. These rows do not claim
 * to reproduce the complete ArchiMate relationship table.
 */
export const RELATIONSHIP_SEMANTIC_ROWS: ReadonlyArray<RelationshipSemanticRow> = Object.freeze(([
  {
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType: 'ApplicationComponent',
    relationshipType: 'AssignmentRelationship',
    targetType: 'ApplicationFunction',
    decision: 'allowed',
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards'
  },
  {
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType: 'ApplicationFunction',
    relationshipType: 'AssignmentRelationship',
    targetType: 'ApplicationComponent',
    decision: 'disallowed',
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards'
  },
  {
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType: 'ApplicationFunction',
    relationshipType: 'RealizationRelationship',
    targetType: 'ApplicationService',
    decision: 'allowed',
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards'
  },
  {
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType: 'ApplicationService',
    relationshipType: 'RealizationRelationship',
    targetType: 'ApplicationFunction',
    decision: 'disallowed',
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards'
  },
  {
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType: 'ApplicationFunction',
    relationshipType: 'AccessRelationship',
    targetType: 'DataObject',
    decision: 'allowed',
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards'
  },
  {
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType: 'DataObject',
    relationshipType: 'AccessRelationship',
    targetType: 'ApplicationFunction',
    decision: 'disallowed',
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards'
  },
  {
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType: 'ApplicationService',
    relationshipType: 'ServingRelationship',
    targetType: 'BusinessProcess',
    decision: 'allowed',
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards'
  },
  {
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType: 'BusinessProcess',
    relationshipType: 'ServingRelationship',
    targetType: 'ApplicationService',
    decision: 'disallowed',
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards'
  },
  ...([
    ['ApplicationComponent', 'FlowRelationship', 'ApplicationComponent', 'Transfer between application components; direction follows the transferred item.'],
    ['ApplicationProcess', 'FlowRelationship', 'ApplicationProcess', 'Transfer between application processes; this does not assert a causal sequence.'],
    ['ApplicationProcess', 'TriggeringRelationship', 'ApplicationProcess', 'The source process precedes or causes the target process.'],
    ['ApplicationEvent', 'TriggeringRelationship', 'ApplicationProcess', 'An application state change starts or affects a process.'],
    ['ApplicationComponent', 'AssignmentRelationship', 'ApplicationProcess', 'The component performs the application process.'],
    ['ApplicationProcess', 'RealizationRelationship', 'ApplicationService', 'The application process implements exposed application behavior.'],
    ['ApplicationProcess', 'AccessRelationship', 'DataObject', 'The process observes or changes the data object.'],
    ['ApplicationService', 'ServingRelationship', 'ApplicationComponent', 'The service supplies functionality to a consuming component.'],
    ['TechnologyService', 'ServingRelationship', 'ApplicationComponent', 'The technology service supplies functionality to an application component.'],
    ['Node', 'AssignmentRelationship', 'Artifact', 'The node hosts a deployed artifact.']
  ] as const).map(([sourceType, relationshipType, targetType, interpretation]) => ({
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType, relationshipType, targetType,
    decision: 'allowed' as const,
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards' as const,
    interpretation
  })),
  ...([
    ['ApplicationProcess', 'AssignmentRelationship', 'ApplicationComponent', 'The performed behavior cannot be assigned responsibility for its performer.'],
    ['ApplicationService', 'RealizationRelationship', 'ApplicationProcess', 'The exposed service cannot implement the concrete process.'],
    ['DataObject', 'AccessRelationship', 'ApplicationProcess', 'The passive data object does not access the process.'],
    ['ApplicationComponent', 'ServingRelationship', 'TechnologyService', 'A technology service provides the functionality to its application consumer, not conversely.'],
    ['Artifact', 'AssignmentRelationship', 'Node', 'A deployed artifact is not the host that executes or stores the artifact.']
  ] as const).map(([sourceType, relationshipType, targetType, interpretation]) => ({
    archimateVersion: RELATIONSHIP_SEMANTICS_VERSION,
    sourceType, relationshipType, targetType,
    decision: 'disallowed' as const,
    evidenceSourceId: 'opengroup-archimate-3.2-reference-cards' as const,
    interpretation
  }))
] satisfies RelationshipSemanticRow[]).map((row) => Object.freeze(row)));

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
