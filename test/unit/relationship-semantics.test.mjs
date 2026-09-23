import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  ARCHIMATE_LANGUAGE_VERSION,
  RELATIONSHIP_SEMANTIC_ROWS,
  validateArchimateXml,
  validateRelationshipSemantics
} from '../../src/validator/index.ts';

const validFixtureUrl = new URL('../fixtures/synthetic/valid-relationship-semantics.xml', import.meta.url);
const invalidFixtureUrl = new URL('../fixtures/synthetic/invalid-relationship-semantics.xml', import.meta.url);

describe('ArchiMate 3.2 relationship semantics', () => {
  it('publishes a versioned, immutable decision set', () => {
    expect(ARCHIMATE_LANGUAGE_VERSION).toBe('3.2');
    expect(Object.isFrozen(RELATIONSHIP_SEMANTIC_ROWS)).toBe(true);
    expect(RELATIONSHIP_SEMANTIC_ROWS.every((row) => Object.isFrozen(row))).toBe(true);
    expect(RELATIONSHIP_SEMANTIC_ROWS.every((row) => row.archimateVersion === '3.2')).toBe(true);
  });

  it.each([
    ['ApplicationComponent', 'AssignmentRelationship', 'ApplicationFunction'],
    ['ApplicationFunction', 'RealizationRelationship', 'ApplicationService'],
    ['ApplicationFunction', 'AccessRelationship', 'DataObject'],
    ['ApplicationService', 'ServingRelationship', 'BusinessProcess']
  ])('allows the synthetic %s / %s / %s interpretation', (sourceType, relationshipType, targetType) => {
    expect(validateRelationshipSemantics({ sourceType, relationshipType, targetType })).toMatchObject({
      archimateVersion: '3.2',
      decision: 'allowed',
      reasonCode: 'MATRIX_ALLOWED'
    });
  });

  it.each([
    ['ApplicationFunction', 'AssignmentRelationship', 'ApplicationComponent'],
    ['ApplicationService', 'RealizationRelationship', 'ApplicationFunction'],
    ['DataObject', 'AccessRelationship', 'ApplicationFunction'],
    ['BusinessProcess', 'ServingRelationship', 'ApplicationService']
  ])('disallows the synthetic reverse %s / %s / %s interpretation', (sourceType, relationshipType, targetType) => {
    expect(validateRelationshipSemantics({ sourceType, relationshipType, targetType })).toMatchObject({
      decision: 'disallowed',
      reasonCode: 'MATRIX_DISALLOWED'
    });
  });

  it('returns unsupported for combinations that have no evidence row', () => {
    expect(validateRelationshipSemantics({
      sourceType: 'ApplicationComponent',
      relationshipType: 'UnknownRelationship',
      targetType: 'ApplicationService'
    })).toMatchObject({ decision: 'unsupported', reasonCode: 'COMBINATION_UNSUPPORTED' });
  });

  it('makes junction and relationship endpoint limits explicit', () => {
    expect(validateRelationshipSemantics({
      sourceType: 'AndJunction',
      relationshipType: 'FlowRelationship',
      targetType: 'ApplicationProcess',
    })).toMatchObject({ decision: 'unsupported', reasonCode: 'JUNCTION_UNSUPPORTED' });
    expect(validateRelationshipSemantics({
      sourceType: 'FlowRelationship',
      relationshipType: 'AssociationRelationship',
      targetType: 'ApplicationProcess',
      sourceKind: 'relationship'
    })).toMatchObject({ decision: 'unsupported', reasonCode: 'RELATIONSHIP_ENDPOINT_UNSUPPORTED' });
  });

  it('does not silently apply the 3.2 decision set to another version', () => {
    expect(validateRelationshipSemantics({
      sourceType: 'ApplicationFunction',
      relationshipType: 'AccessRelationship',
      targetType: 'DataObject',
      archimateVersion: '3.1'
    })).toMatchObject({ decision: 'unsupported', reasonCode: 'VERSION_UNSUPPORTED' });
  });

  it('integrates allowed and disallowed synthetic fixtures with XML validation', async () => {
    const validXml = await readFile(validFixtureUrl, 'utf8');
    const invalidXml = await readFile(invalidFixtureUrl, 'utf8');
    const validResult = validateArchimateXml(validXml);
    const invalidResult = validateArchimateXml(invalidXml);

    expect(validResult.valid).toBe(true);
    expect(validResult.diagnostics.map(({ code }) => code)).not.toContain('SEMANTICS_RELATIONSHIP_DISALLOWED');
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.diagnostics.map(({ code }) => code)).toContain('SEMANTICS_RELATIONSHIP_DISALLOWED');
    expect(JSON.stringify(invalidResult)).not.toContain('synthetic-reversed-access');
    expect(invalidXml).toContain('synthetic-reversed-access');
  });
});
