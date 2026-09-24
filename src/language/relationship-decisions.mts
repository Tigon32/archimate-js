/**
 * Conservative ArchiMate 3.2 relationship interpretations.
 *
 * This independently authored, versioned decision set is not a complete
 * standards matrix. Missing tuples remain unsupported.
 */

export const RELATIONSHIP_SEMANTICS_VERSION = '3.2' as const;
export type RelationshipSemanticDecision = 'allowed' | 'disallowed' | 'unsupported';

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

