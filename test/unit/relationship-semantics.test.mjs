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
const integrationFixtureUrl = new URL('../fixtures/synthetic/application-integration-semantics.json', import.meta.url);
const integrationCases = JSON.parse(await readFile(integrationFixtureUrl, 'utf8'));

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

  it.each(integrationCases)('reviews %s / %s / %s as %s in the public service and XML validator',
    (sourceType, relationshipType, targetType, decision) => {
      const input = { sourceType, relationshipType, targetType };
      const result = validateRelationshipSemantics(input);
      expect(result).toMatchObject({
        archimateVersion: '3.2',
        decision,
        reasonCode: decision === 'allowed' ? 'MATRIX_ALLOWED' : 'MATRIX_DISALLOWED',
        evidenceSourceId: 'opengroup-archimate-3.2-reference-cards',
        interpretation: expect.any(String)
      });
      expect(result.interpretation.length).toBeGreaterThan(20);

      const xml = `<?xml version="1.0"?>
<model identifier="synthetic-integration-model" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <elements>
    <element identifier="synthetic-source" xsi:type="archimate:${sourceType}" />
    <element identifier="synthetic-target" xsi:type="archimate:${targetType}" />
  </elements>
  <relationships>
    <relationship identifier="synthetic-link" source="synthetic-source" target="synthetic-target" xsi:type="archimate:${relationshipType}" />
  </relationships>
</model>`;
      const validation = validateArchimateXml(xml);
      expect(validation.valid).toBe(decision === 'allowed');
      expect(validation.diagnostics.map(({ code }) => code).includes('SEMANTICS_RELATIONSHIP_DISALLOWED'))
        .toBe(decision === 'disallowed');
    });

  it('covers exactly the added synthetic rows, and keeps deployment to components unreviewed', () => {
    const rowKey = ({ sourceType, relationshipType, targetType, decision }) =>
      [sourceType, relationshipType, targetType, decision].join('|');
    const keys = integrationCases.map((row) => row.join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(RELATIONSHIP_SEMANTIC_ROWS.filter((row) => row.interpretation).map(rowKey).sort()).toEqual(keys.sort());
    expect(validateRelationshipSemantics({
      sourceType: 'Node', relationshipType: 'AssignmentRelationship', targetType: 'ApplicationComponent'
    })).toMatchObject({ decision: 'unsupported', reasonCode: 'COMBINATION_UNSUPPORTED' });
    expect(validateRelationshipSemantics({
      sourceType: 'ApplicationProcess', relationshipType: 'FlowRelationship', targetType: 'ApplicationEvent'
    })).toMatchObject({ decision: 'unsupported', reasonCode: 'COMBINATION_UNSUPPORTED' });
    expect(validateRelationshipSemantics({
      sourceType: 'ApplicationComponent', relationshipType: 'ServingRelationship', targetType: 'ApplicationService'
    })).toMatchObject({ decision: 'unsupported', reasonCode: 'COMBINATION_UNSUPPORTED' });
  });
});
