// SYNTHETIC provenance: endpoint types and relationship choices are hand-authored test values.
import { describe, expect, it } from 'vitest';

// @ts-expect-error Legacy metamodel constants do not have declarations yet.
import * as legacyConcepts from '../../lib/metamodel/Concept.js';
const {
  RELATIONSHIP_ASSIGNMENT,
  RELATIONSHIP_ASSOCIATION,
  RELATIONSHIP_FLOW,
  RELATIONSHIP_REALIZATION,
  RELATIONSHIP_SERVING,
  RELATIONSHIP_TRIGGERING
} = legacyConcepts;
import {
  getExistingRelationships,
  getRelationshipsAllowed,
  isRelationshipAllowed
} from '../../lib/util/RelationshipUtil.mjs';
import { RELATIONSHIP_SEMANTIC_ROWS } from '../../src/language/relationship-decisions.mjs';

function expectCreateOptionsToMatchReviewedRows(): void {
  const pairs = new Set(RELATIONSHIP_SEMANTIC_ROWS.map((row) => `${row.sourceType}|${row.targetType}`));
  for (const key of pairs) {
    const [sourceType, targetType] = key.split('|');
    const expected = RELATIONSHIP_SEMANTIC_ROWS
      .filter((row) => row.sourceType === sourceType && row.targetType === targetType && row.decision === 'allowed')
      .map((row) => row.relationshipType.replace(/Relationship$/, ''));
    expect(getRelationshipsAllowed(sourceType, targetType)).toEqual(expected);
  }
}

function expectReconnectChoicesToMatchReviewedRows(): void {
  for (const row of RELATIONSHIP_SEMANTIC_ROWS) {
    expect(isRelationshipAllowed(row.sourceType, row.targetType,
      row.relationshipType.replace(/Relationship$/, ''))).toBe(row.decision === 'allowed');
  }
}

describe('relationship rule utility', () => {
  it('returns allowed relationship kinds for an application component and service', () => {
    expect(getRelationshipsAllowed('ApplicationComponent', 'ApplicationService')).toEqual([
      RELATIONSHIP_ASSIGNMENT,
      RELATIONSHIP_REALIZATION,
      RELATIONSHIP_SERVING,
      RELATIONSHIP_TRIGGERING,
      RELATIONSHIP_FLOW,
      RELATIONSHIP_ASSOCIATION
    ]);
  });

  it('excludes the current relationship kind when requested', () => {
    expect(
      getRelationshipsAllowed('ApplicationComponent', 'ApplicationService', RELATIONSHIP_SERVING)
    ).not.toContain(RELATIONSHIP_SERVING);
  });

  it('checks whether an individual relationship kind is allowed', () => {
    expect(isRelationshipAllowed(
      'ApplicationComponent',
      'ApplicationService',
      RELATIONSHIP_SERVING
    )).toBe(true);
    expect(isRelationshipAllowed(
      'ApplicationComponent',
      'ApplicationService',
      'Composition'
    )).toBe(false);
  });

  it('uses only explicitly allowed registry rows for covered endpoint pairs', () => {
    expectCreateOptionsToMatchReviewedRows();
    expectReconnectChoicesToMatchReviewedRows();
    expect(getRelationshipsAllowed('ApplicationFunction', 'ApplicationComponent')).toEqual([]);
    expect(isRelationshipAllowed('ApplicationFunction', 'ApplicationComponent', RELATIONSHIP_ASSIGNMENT)).toBe(false);
    expect(isRelationshipAllowed('ApplicationFunction', 'ApplicationComponent', RELATIONSHIP_ASSOCIATION)).toBe(false);
  });

  it('keeps an imported synthetic relationship reference intact outside reviewed rows', () => {
    const importedRelationship = { id: 'synthetic-legacy-edge', source: { id: 'synthetic-source' },
      target: { id: 'synthetic-target' }, type: 'SyntheticLegacyRelationship' };
    const source = { businessObject: { elementRef: { id: 'synthetic-source' },
      $instanceOf: (type: string) => type === 'archimate:Node' } };
    const target = { businessObject: { elementRef: { id: 'synthetic-target' },
      $instanceOf: (type: string) => type === 'archimate:Node' } };
    const retained = getRelationshipsAllowed('ApplicationComponent', 'ApplicationService');
    const existing = getExistingRelationships(source, target, { relationships: [importedRelationship] }, undefined);

    expect(retained).toEqual([
      RELATIONSHIP_ASSIGNMENT,
      RELATIONSHIP_REALIZATION,
      RELATIONSHIP_SERVING,
      RELATIONSHIP_TRIGGERING,
      RELATIONSHIP_FLOW,
      RELATIONSHIP_ASSOCIATION
    ]);
    expect(existing).toEqual([importedRelationship]);
  });
});
