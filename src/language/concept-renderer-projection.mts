import type { ConceptRecord } from './concept-registry.mjs';

const rendererRows = (records: readonly ConceptRecord[]): ConceptRecord[] => records
  .slice()
  .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));

export const renderConceptRendererProjection = (records: readonly ConceptRecord[]): string => {
  const metadata = Object.fromEntries(rendererRows(records).map((record) =>
    [record.canonicalId, record.renderer]
  ));
  const aliases = Object.fromEntries(rendererRows(records).flatMap((record) =>
    [...record.aliases, record.canonicalId].map((alias) => [alias, record.canonicalId])
  ));
  return [
    '// Generated from src/language/concept-registry.mts by scripts/concept-renderer-projection.mts.',
    `export const CONCEPT_RENDERER_METADATA_BY_ID = Object.freeze(${JSON.stringify(metadata, null, 2)});`,
    `const CANONICAL_ID_BY_ALIAS = Object.freeze(${JSON.stringify(aliases, null, 2)});`,
    'export const resolveCanonicalConceptId = (identity) => CANONICAL_ID_BY_ALIAS[identity];',
    'export const resolveConceptRendererMetadata = (identity) => {',
    '  const canonicalId = resolveCanonicalConceptId(identity);',
    '  return canonicalId ? CONCEPT_RENDERER_METADATA_BY_ID[canonicalId] : undefined;',
    '};',
    ''
  ].join('\n');
};

export const isConceptRendererProjectionCurrent = (
  projection: string,
  records: readonly ConceptRecord[]
): boolean => projection === renderConceptRendererProjection(records);
