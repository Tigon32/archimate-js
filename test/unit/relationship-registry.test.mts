import { describe, expect, it } from 'vitest';

import { RELATIONSHIP_SEMANTIC_ROWS as sourceRows } from '../../src/language/relationship-decisions.mjs';
import {
  RELATIONSHIP_SEMANTIC_ROWS,
  parseSemanticProfile,
  validateRelationshipSemantics
} from '../../src/validator/index.js';

// SYNTHETIC migration baseline: tuples reviewed before extraction into src/language.
const existingRows = [
  'ApplicationComponent|AssignmentRelationship|ApplicationFunction|allowed',
  'ApplicationFunction|AssignmentRelationship|ApplicationComponent|disallowed',
  'ApplicationFunction|RealizationRelationship|ApplicationService|allowed',
  'ApplicationService|RealizationRelationship|ApplicationFunction|disallowed',
  'ApplicationFunction|AccessRelationship|DataObject|allowed',
  'DataObject|AccessRelationship|ApplicationFunction|disallowed',
  'ApplicationService|ServingRelationship|BusinessProcess|allowed',
  'BusinessProcess|ServingRelationship|ApplicationService|disallowed',
  'ApplicationComponent|FlowRelationship|ApplicationComponent|allowed',
  'ApplicationProcess|FlowRelationship|ApplicationProcess|allowed',
  'ApplicationProcess|TriggeringRelationship|ApplicationProcess|allowed',
  'ApplicationEvent|TriggeringRelationship|ApplicationProcess|allowed',
  'ApplicationComponent|AssignmentRelationship|ApplicationProcess|allowed',
  'ApplicationProcess|RealizationRelationship|ApplicationService|allowed',
  'ApplicationProcess|AccessRelationship|DataObject|allowed',
  'ApplicationService|ServingRelationship|ApplicationComponent|allowed',
  'TechnologyService|ServingRelationship|ApplicationComponent|allowed',
  'Node|AssignmentRelationship|Artifact|allowed',
  'ApplicationProcess|AssignmentRelationship|ApplicationComponent|disallowed',
  'ApplicationService|RealizationRelationship|ApplicationProcess|disallowed',
  'DataObject|AccessRelationship|ApplicationProcess|disallowed',
  'ApplicationComponent|ServingRelationship|TechnologyService|disallowed',
  'Artifact|AssignmentRelationship|Node|disallowed'
];

const rowKey = (row: typeof RELATIONSHIP_SEMANTIC_ROWS[number]): string =>
  [row.sourceType, row.relationshipType, row.targetType, row.decision].join('|');

describe('reviewed relationship registry extraction', () => {
  it('keeps the complete reviewed tuple baseline and a single frozen public projection', () => {
    expect(RELATIONSHIP_SEMANTIC_ROWS).toBe(sourceRows);
    expect(RELATIONSHIP_SEMANTIC_ROWS.map(rowKey)).toEqual(existingRows);
    expect(Object.isFrozen(sourceRows)).toBe(true);
    expect(sourceRows.every((row) => Object.isFrozen(row))).toBe(true);
    expect(new Set(sourceRows.map((row) =>
      [row.archimateVersion, row.sourceType, row.relationshipType, row.targetType].join('|')
    )).size).toBe(sourceRows.length);
    expect(sourceRows.every((row) =>
      row.archimateVersion === '3.2' && row.evidenceSourceId === 'opengroup-archimate-3.2-reference-cards'
    )).toBe(true);
  });

  it('preserves each reviewed decision and leaves absent or unreviewed tuples unsupported', () => {
    for (const row of sourceRows) {
      expect(validateRelationshipSemantics(row)).toEqual({
        archimateVersion: row.archimateVersion,
        decision: row.decision,
        decisionLayer: 'core',
        reasonCode: row.decision === 'allowed' ? 'MATRIX_ALLOWED' : 'MATRIX_DISALLOWED',
        evidenceSourceId: row.evidenceSourceId,
        interpretation: row.interpretation
      });
    }
    const input = { sourceType: 'Node', relationshipType: 'AssignmentRelationship', targetType: 'ApplicationComponent' };
    expect(validateRelationshipSemantics(input)).toMatchObject({ decision: 'unsupported', reasonCode: 'COMBINATION_UNSUPPORTED' });
    expect(validateRelationshipSemantics({ ...input, archimateVersion: '4.0' })).toMatchObject({
      decision: 'unsupported', reasonCode: 'VERSION_UNSUPPORTED'
    });
    expect(validateRelationshipSemantics({ ...input, sourceKind: 'junction' })).toMatchObject({
      decision: 'unsupported', reasonCode: 'JUNCTION_UNSUPPORTED'
    });
    expect(validateRelationshipSemantics({ ...input, sourceKind: 'relationship' })).toMatchObject({
      decision: 'unsupported', reasonCode: 'RELATIONSHIP_ENDPOINT_UNSUPPORTED'
    });
  });

  it('layers a non-normative profile only over unsupported core combinations', () => {
      const before = structuredClone(sourceRows);
      const profile = parseSemanticProfile({
        id: 'synthetic-org-profile',
        version: '2026.09',
        kind: 'organization',
        rows: [{
          archimateVersion: '3.2',
          sourceType: 'BusinessActor',
          relationshipType: 'ServingRelationship',
          targetType: 'TechnologyService',
          decision: 'allowed',
          evidenceSourceId: 'profile:synthetic-org-reviewed',
          nonNormative: true,
          interpretation: 'SYNTHETIC organization extension for unit testing only.'
        }, {
          archimateVersion: '3.2',
          sourceType: 'ApplicationFunction',
          relationshipType: 'AccessRelationship',
          targetType: 'DataObject',
          decision: 'disallowed',
          evidenceSourceId: 'profile:synthetic-org-shadow',
          nonNormative: true
        }]
      });

      expect(validateRelationshipSemantics({
        sourceType: 'BusinessActor',
        relationshipType: 'ServingRelationship',
        targetType: 'TechnologyService'
      }, profile)).toMatchObject({
        decision: 'allowed',
        decisionLayer: 'synthetic-org-profile',
        reasonCode: 'PROFILE_ALLOWED',
        nonNormative: true
      });
      expect(validateRelationshipSemantics({
        sourceType: 'ApplicationFunction',
        relationshipType: 'AccessRelationship',
        targetType: 'DataObject'
      }, profile)).toMatchObject({
        decision: 'allowed',
        decisionLayer: 'core',
        reasonCode: 'MATRIX_ALLOWED'
      });
      expect(Object.isFrozen(sourceRows)).toBe(true);
      expect(sourceRows.every((row) => Object.isFrozen(row))).toBe(true);
      expect(sourceRows).toEqual(before);
  });

  it('rejects invalid profile rows with explicit boundary errors', () => {
      expect(() => parseSemanticProfile({
        id: 'synthetic-invalid',
        version: '2026.09',
        kind: 'organization',
        rows: [{
          archimateVersion: '3.2',
          sourceType: 'BusinessActor',
          relationshipType: 'ServingRelationship',
          targetType: 'TechnologyService',
          decision: 'allowed',
          evidenceSourceId: 'opengroup-archimate-3.2-reference-cards',
          nonNormative: true
        }]
      })).toThrow(/evidenceSourceId must be non-normative/);
      expect(() => parseSemanticProfile({
        id: 'synthetic-invalid',
        version: '2026.09',
        kind: 'experimental',
        rows: [{
          archimateVersion: '3.2',
          sourceType: 'BusinessActor',
          relationshipType: 'ServingRelationship',
          targetType: 'TechnologyService',
          decision: 'allowed',
          evidenceSourceId: 'profile:synthetic',
          nonNormative: false
        }]
      })).toThrow(/nonNormative must be true/);
  });
});
