import {
  RELATIONSHIP_SEMANTICS_VERSION,
  type RelationshipSemanticDecision
} from './relationship-decisions.mjs';

export type SemanticProfileKind = 'organization' | 'experimental';

export interface SemanticProfileRow {
  archimateVersion: typeof RELATIONSHIP_SEMANTICS_VERSION;
  sourceType: string;
  relationshipType: string;
  targetType: string;
  decision: Exclude<RelationshipSemanticDecision, 'unsupported'>;
  evidenceSourceId: string;
  nonNormative: true;
  interpretation?: string;
}

export interface SemanticProfile {
  id: string;
  version: string;
  kind: SemanticProfileKind;
  rows: ReadonlyArray<SemanticProfileRow>;
}

const KINDS = new Set<SemanticProfileKind>(['organization', 'experimental']);
const OPEN_GROUP_EVIDENCE = 'opengroup-archimate-3.2-reference-cards';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function expectString(value: unknown, path: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  throw new TypeError(`Invalid semantic profile: ${path} must be a non-empty string.`);
}

function expectKind(value: unknown): SemanticProfileKind {
  if (typeof value === 'string' && KINDS.has(value as SemanticProfileKind)) {
    return value as SemanticProfileKind;
  }
  throw new TypeError('Invalid semantic profile: kind must be organization or experimental.');
}

function expectDecision(value: unknown, path: string): SemanticProfileRow['decision'] {
  if (value === 'allowed' || value === 'disallowed') return value;
  throw new TypeError(`Invalid semantic profile: ${path} must be allowed or disallowed.`);
}

function parseRow(value: unknown, index: number): SemanticProfileRow {
  if (!isRecord(value)) throw new TypeError(`Invalid semantic profile: rows[${index}] must be an object.`);
  const archimateVersion = expectString(value.archimateVersion, `rows[${index}].archimateVersion`);
  if (archimateVersion !== RELATIONSHIP_SEMANTICS_VERSION) {
    throw new TypeError(`Invalid semantic profile: rows[${index}].archimateVersion must be ${RELATIONSHIP_SEMANTICS_VERSION}.`);
  }
  if (value.nonNormative !== true) {
    throw new TypeError(`Invalid semantic profile: rows[${index}].nonNormative must be true.`);
  }
  const evidenceSourceId = expectString(value.evidenceSourceId, `rows[${index}].evidenceSourceId`);
  if (evidenceSourceId === OPEN_GROUP_EVIDENCE || evidenceSourceId.startsWith('opengroup-')) {
    throw new TypeError(`Invalid semantic profile: rows[${index}].evidenceSourceId must be non-normative.`);
  }
  const interpretation = value.interpretation;
  if (interpretation !== undefined && typeof interpretation !== 'string') {
    throw new TypeError(`Invalid semantic profile: rows[${index}].interpretation must be a string.`);
  }
  return Object.freeze({
    archimateVersion,
    sourceType: expectString(value.sourceType, `rows[${index}].sourceType`),
    relationshipType: expectString(value.relationshipType, `rows[${index}].relationshipType`),
    targetType: expectString(value.targetType, `rows[${index}].targetType`),
    decision: expectDecision(value.decision, `rows[${index}].decision`),
    evidenceSourceId,
    nonNormative: true,
    ...(interpretation === undefined ? {} : { interpretation })
  });
}

export function parseSemanticProfile(input: unknown): SemanticProfile {
  if (!isRecord(input)) throw new TypeError('Invalid semantic profile: profile must be an object.');
  if (!Array.isArray(input.rows)) throw new TypeError('Invalid semantic profile: rows must be an array.');
  const rows = input.rows.map(parseRow);
  const keys = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const key = [row.archimateVersion, row.sourceType, row.relationshipType, row.targetType].join('|');
    if (keys.has(key)) throw new TypeError(`Invalid semantic profile: rows[${index}] duplicates another row.`);
    keys.add(key);
  }
  return Object.freeze({
    id: expectString(input.id, 'id'),
    version: expectString(input.version, 'version'),
    kind: expectKind(input.kind),
    rows: Object.freeze(rows)
  });
}
