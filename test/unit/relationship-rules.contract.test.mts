// SYNTHETIC provenance: endpoint types and relationship choices are hand-authored test values.
import { describe, expect, it } from 'vitest';

// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
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
// @ts-expect-error Legacy JavaScript RuleProvider has no declaration.
import ArchimateRules from '../../lib/features/rules/ArchimateRules.js';
import { DiagramAdapter, importMeffToModelDto } from '../../src/model-dto/index.js';

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

type RuleElement = {
  type: string;
  businessObject: {
    type: string;
    $instanceOf(type: string): boolean;
  };
};

function ruleElement(type: string, businessObjectType = 'Element'): RuleElement {
  return {
    type,
    businessObject: {
      type: businessObjectType,
      $instanceOf: (expected) =>
        businessObjectType === 'Element' && expected === 'archimate:Node' ||
        businessObjectType === 'Relationship' && expected === 'archimate:Connection'
    }
  };
}

function connectDecision(source: RuleElement, target: RuleElement, relationshipType?: string): unknown {
  type RuleContext = { source: RuleElement; target: RuleElement; connection?: { type: string } };
  const callbacks = new Map<string, (context: RuleContext) => unknown>();
  const rules = Object.create(ArchimateRules.prototype) as {
    addRule(action: string, callback: (context: RuleContext) => unknown): void;
    init(): void;
  };
  rules.addRule = (action, callback) => { callbacks.set(action, callback); };
  rules.init();

  const action = relationshipType ? 'connection.reconnect' : 'connection.create';
  const callback = callbacks.get(action);
  if (!callback) throw new Error(`Missing ${action} RuleProvider callback.`);
  return callback({
    source,
    target,
    connection: relationshipType ? { type: relationshipType } : undefined
  });
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
});

describe('live RuleProvider relationship authority', () => {
  it('allows a reviewed tuple through the reconnect RuleProvider', () => {
    const allowed = RELATIONSHIP_SEMANTIC_ROWS.find((row) => row.decision === 'allowed')!;
    expect(connectDecision(ruleElement(allowed.sourceType), ruleElement(allowed.targetType),
      allowed.relationshipType.replace(/Relationship$/, ''))).toEqual({
      type: allowed.relationshipType.replace(/Relationship$/, '')
    });
  });

  it('rejects a reviewed disallowed tuple through the reconnect RuleProvider', () => {
    const disallowed = RELATIONSHIP_SEMANTIC_ROWS.find((row) => row.decision === 'disallowed')!;
    expect(connectDecision(ruleElement(disallowed.sourceType), ruleElement(disallowed.targetType),
      disallowed.relationshipType.replace(/Relationship$/, ''))).toBe(false);
  });

  it('defers an unsupported tuple through the reconnect RuleProvider', () => {
    expect(connectDecision(ruleElement('ApplicationComponent'), ruleElement('ApplicationService'),
      'Serving')).toBeUndefined();
  });

  it('keeps relationship endpoints as structural connections outside semantic tuples', () => {
    const relationship = ruleElement('Serving', 'Relationship');
    const element = ruleElement('ApplicationComponent');

    expect(connectDecision(relationship, element)).toEqual({ type: 'Association' });
    expect(connectDecision(element, relationship)).toEqual({ type: 'Association' });
    expect(connectDecision(relationship, relationship)).toBe(false);
    expect(connectDecision(ruleElement('Label', 'Note'), element)).toEqual({
      type: 'Line'
    });
    expect(connectDecision(ruleElement('AndJunction'), element, 'Association')).toBeUndefined();
  });

  it('defers unsupported RuleProvider tuples to the DTO command diagnostic atomically', () => {
    const source = ruleElement('ApplicationComponent');
    const target = ruleElement('ApplicationService');
    expect(connectDecision(source, target, 'Serving')).toBeUndefined();

    const model = importMeffToModelDto(readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8'));
    const editor = new DiagramAdapter(model);
    const before = editor.serialize();
    let diagnostic: unknown;
    try {
      editor.execute({
        type: 'connect',
        viewId: 'view-dto-export',
        relationship: {
          id: 'synthetic-unsupported-relationship',
          type: 'archimate:Serving',
          sourceId: 'component-one',
          targetId: 'service-two'
        },
        connection: {
          id: 'synthetic-unsupported-connection',
          kind: 'relationship',
          relationshipId: 'synthetic-unsupported-relationship',
          sourceId: 'node-component',
          targetId: 'node-service',
          waypoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }]
        }
      });
    } catch (error) {
      diagnostic = (error as { diagnostic?: unknown }).diagnostic;
    }

    expect(diagnostic).toMatchObject({
      code: 'DTO_RELATIONSHIP_UNSUPPORTED',
      category: 'unsupported-profile',
      operation: 'connect'
    });
    expect(editor.serialize()).toBe(before);
    expect(editor.undo()).toBe(false);
  });

  it('does not consult the generated legacy relationship utility in RuleProvider', () => {
    const source = readFileSync('lib/features/rules/ArchimateRules.js', 'utf8');
    const adapter = readFileSync('lib/util/RelationshipSemanticsAdapter.mts', 'utf8');
    expect(source).toContain('RelationshipSemanticsAdapter');
    expect(source).not.toMatch(/isRelationshipAllowed|RelationshipUtil/);
    expect(adapter).toContain('validateRelationshipSemantics');
    expect(adapter).toContain('../../dist/language/relationship-semantics.mjs');
    expect(adapter).not.toMatch(/isRelationshipAllowed|RelationshipUtil/);
  });
});

describe('legacy relationship preservation', () => {
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
