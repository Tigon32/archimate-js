import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  RELATIONSHIP_SEMANTIC_ROWS,
  type RelationshipSemanticRow
} from '../src/language/relationship-decisions.mts';

export const MATRIX_START = '<!-- BEGIN GENERATED RELATIONSHIP REGISTRY -->';
export const MATRIX_END = '<!-- END GENERATED RELATIONSHIP REGISTRY -->';
const DOCUMENT_PATH = resolve('docs/standards/relationship-validation-matrix.md');
const code = String.fromCharCode(96);

const escapeCell = (value: string): string =>
  value.replaceAll('|', '\\|').replaceAll('\n', '<br>');

const renderRow = (row: RelationshipSemanticRow): string => {
  const cells = [
  row.archimateVersion,
  code + escapeCell(row.sourceType) + code,
  code + escapeCell(row.relationshipType) + code,
  code + escapeCell(row.targetType) + code,
  row.decision,
  code + escapeCell(row.evidenceSourceId) + code,
  row.interpretation ? escapeCell(row.interpretation) : '—'
];
  return '| ' + cells.join(' | ') + ' |';
};

export const renderGeneratedMatrix = (
  rows: readonly RelationshipSemanticRow[]
): string => [
  MATRIX_START,
  '| ArchiMate version | Source type | Relationship type | Target type | Decision | Evidence source | Interpretation |',
  '|---|---|---|---|---|---|---|',
  ...rows.map(renderRow),
  MATRIX_END
].join('\n');

const generatedRegion = (document: string): string | undefined => {
  const start = document.indexOf(MATRIX_START);
  const end = document.indexOf(MATRIX_END);
  if (start < 0 || end < start || document.indexOf(MATRIX_START, start + MATRIX_START.length) >= 0 ||
      document.indexOf(MATRIX_END, end + MATRIX_END.length) >= 0) return undefined;
  return document.slice(start, end + MATRIX_END.length);
};

export const isMatrixCurrent = (
  document: string,
  rows: readonly RelationshipSemanticRow[]
): boolean => generatedRegion(document) === renderGeneratedMatrix(rows);

export const updateGeneratedMatrix = (
  document: string,
  rows: readonly RelationshipSemanticRow[]
): string => {
  const region = generatedRegion(document);
  if (region === undefined) {
    throw new Error('Expected exactly one ordered generated relationship registry marker pair.');
  }
  return document.replace(region, renderGeneratedMatrix(rows));
};

const run = (): void => {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--write') {
    throw new Error('Usage: node scripts/relationship-matrix-document.mts --check|--write');
  }

  const document = readFileSync(DOCUMENT_PATH, 'utf8');
  if (mode === '--check') {
    if (!isMatrixCurrent(document, RELATIONSHIP_SEMANTIC_ROWS)) {
      throw new Error('Relationship matrix documentation is stale; run npm run generate:relationship-matrix.');
    }
    return;
  }
  writeFileSync(DOCUMENT_PATH, updateGeneratedMatrix(document, RELATIONSHIP_SEMANTIC_ROWS));
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
