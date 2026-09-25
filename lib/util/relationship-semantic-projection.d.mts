export interface RelationshipSemanticProjectionRow {
  archimateVersion: '3.2';
  sourceType: string;
  relationshipType: string;
  targetType: string;
  decision: 'allowed' | 'disallowed';
  evidenceSourceId: 'opengroup-archimate-3.2-reference-cards';
  interpretation?: string;
}

export const RELATIONSHIP_SEMANTIC_ROWS: ReadonlyArray<RelationshipSemanticProjectionRow>;
