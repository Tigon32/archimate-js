// @ts-expect-error Legacy JavaScript utility; migrated separately.
import { getRelationshipMap, is } from './ModelUtil.js';
import { RELATIONSHIP_SEMANTIC_ROWS } from './relationship-semantic-projection.generated.mjs';

const relationTab: Readonly<Record<string, string>> = Object.freeze({
  s: 'Specialization',
  c: 'Composition',
  g: 'Aggregation',
  i: 'Assignment',
  r: 'Realization',
  v: 'Serving',
  a: 'Access',
  n: 'Influence',
  t: 'Triggering',
  f: 'Flow',
  o: 'Association'
});

type RelationshipSemanticRow = (typeof RELATIONSHIP_SEMANTIC_ROWS)[number];
type LegacyRelationship = { id?: string; source?: { id?: string }; target?: { id?: string } };
type LegacyBusinessObject = {
  elementRef?: { id?: string };
  relationshipRef?: { id?: string };
};
type LegacyCanvasElement = { businessObject?: LegacyBusinessObject };
const reviewedRows: ReadonlyArray<RelationshipSemanticRow> = RELATIONSHIP_SEMANTIC_ROWS;

function semanticType(relationshipType: string): string {
  return relationshipType.endsWith('Relationship') ? relationshipType : `${relationshipType}Relationship`;
}

function legacyType(relationshipType: string): string {
  return relationshipType.replace(/Relationship$/, '');
}

function reviewedRowsForPair(sourceType: string, targetType: string): RelationshipSemanticRow[] {
  return reviewedRows.filter((row) => row.sourceType === sourceType && row.targetType === targetType);
}

export function getRelationshipsAllowed(sourceType: string, targetType: string, excludedRelationType?: string): string[] {
  if (!sourceType || !targetType) return [];

  const rows = reviewedRowsForPair(sourceType, targetType);
  if (rows.length > 0) {
    return rows
      .filter((row) => row.decision === 'allowed')
      .map((row) => Object.values(relationTab).find((type) => type === legacyType(row.relationshipType)))
      .filter((relationship): relationship is string => relationship !== undefined)
      .filter((relationship) => relationship !== excludedRelationType);
  }

  const sourceRelationshipMap = getRelationshipMap(sourceType);
  const allowedCodes: string | undefined = sourceRelationshipMap?.get(targetType);
  if (!allowedCodes) return [];
  return Array.from(allowedCodes, (code) => relationTab[code] ?? '')
    .filter((relationship) => relationship !== '' && relationship !== excludedRelationType);
}

export function isRelationshipAllowed(sourceType: string, targetType: string, relationshipType: string): boolean {
  if (!sourceType || !targetType || !relationshipType) return false;

  const rows = reviewedRowsForPair(sourceType, targetType);
  if (rows.length > 0) {
    return rows.some((row) => row.relationshipType === semanticType(relationshipType) && row.decision === 'allowed');
  }

  const sourceRelationshipMap = getRelationshipMap(sourceType);
  const allowedCodes: string | undefined = sourceRelationshipMap?.get(targetType);
  if (!allowedCodes) return false;
  return Array.from(allowedCodes, (code) => relationTab[code] ?? '')
    .some((relationship) => relationship === legacyType(relationshipType));
}

type RelationshipsNode = { relationships?: LegacyRelationship[] };
export function getExistingRelationships(source: LegacyCanvasElement, target: LegacyCanvasElement,
  relationshipsNode?: RelationshipsNode, currentRelationshipRef?: string): LegacyRelationship[] {
  const sourceBusinessObject = source.businessObject;
  const targetBusinessObject = target.businessObject;
  let sourceRefId: string | undefined;
  let targetRefId: string | undefined;

  if (is(sourceBusinessObject, 'archimate:Node')) sourceRefId = sourceBusinessObject?.elementRef?.id;
  if (is(sourceBusinessObject, 'archimate:Connection')) sourceRefId = sourceBusinessObject?.relationshipRef?.id;
  if (is(targetBusinessObject, 'archimate:Node')) targetRefId = targetBusinessObject?.elementRef?.id;
  if (is(targetBusinessObject, 'archimate:Connection')) targetRefId = targetBusinessObject?.relationshipRef?.id;

  const relationships = relationshipsNode?.relationships ?? [];
  return relationships.filter((relationship) =>
    relationship.source?.id === sourceRefId &&
    relationship.target?.id === targetRefId &&
    relationship.id !== currentRelationshipRef
  );
}
