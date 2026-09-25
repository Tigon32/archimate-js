import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  RELATIONSHIP_SEMANTIC_ROWS,
  type RelationshipSemanticRow
} from '../../src/language/relationship-decisions.mjs';
import {
  isMatrixCurrent,
  renderGeneratedMatrix
} from '../../scripts/relationship-matrix-document.mjs';

const document = readFileSync(
  new URL('../../docs/standards/relationship-validation-matrix.md', import.meta.url),
  'utf8'
);
const code = String.fromCharCode(96);

const renderedRow = (row: RelationshipSemanticRow): string => {
  const cells = [
  row.archimateVersion,
  code + row.sourceType + code,
  code + row.relationshipType + code,
  code + row.targetType + code,
  row.decision,
  code + row.evidenceSourceId + code,
  row.interpretation ?? '—'
];
  return '| ' + cells.join(' | ') + ' |';
};

describe('generated relationship matrix documentation', () => {
  it('renders the same source projection deterministically and includes each reviewed row once', () => {
    const rendered = renderGeneratedMatrix(RELATIONSHIP_SEMANTIC_ROWS);
    expect(renderGeneratedMatrix(RELATIONSHIP_SEMANTIC_ROWS)).toBe(rendered);
    for (const row of RELATIONSHIP_SEMANTIC_ROWS) {
      const line = renderedRow(row);
      expect(rendered.split(line)).toHaveLength(2);
    }
    expect(rendered.split('\n')).toHaveLength(RELATIONSHIP_SEMANTIC_ROWS.length + 4);
  });

  it('accepts the checked-in projection and rejects an edited generated row', () => {
    expect(isMatrixCurrent(document, RELATIONSHIP_SEMANTIC_ROWS)).toBe(true);
    const changed = document.replace('ApplicationComponent', 'SyntheticChangedType');
    expect(isMatrixCurrent(changed, RELATIONSHIP_SEMANTIC_ROWS)).toBe(false);
  });
});
