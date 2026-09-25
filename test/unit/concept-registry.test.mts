// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// @ts-expect-error Legacy metamodel constants are not yet typed.
import * as legacyConcepts from '../../lib/metamodel/Concept.js';
import {
  CONCEPT_RECORDS,
  createConceptRegistry,
  resolveConcept,
  type ConceptRecord
} from '../../src/language/concept-registry.mjs';
import {
  isConceptRendererProjectionCurrent,
  renderConceptRendererProjection
} from '../../src/language/concept-renderer-projection.mjs';
// @ts-expect-error The browser runtime consumes this generated compatibility projection.
import { resolveCanonicalConceptId } from '../../lib/draw/concept-renderer.generated.mjs';

const projection = readFileSync(
  new URL('../../lib/draw/concept-renderer.generated.mjs', import.meta.url),
  'utf8'
);

const legacyConceptValues = Object.entries(legacyConcepts)
  .filter(([name]) => /^(MOTIVATION|STRATEGY|BUSINESS|APPLICATION|TECHNOLOGY|PHYSICAL|IMP_MIG|OTHER)_/.test(name))
  .map(([, value]) => value)
  .sort();

const syntheticRecord = (
  canonicalId: string,
  type: string,
  aliases: readonly string[]
): ConceptRecord => ({
  canonicalId,
  type,
  category: 'element',
  layer: 'Other',
  aspect: 'Active structure',
  aliases,
  renderer: { domain: 'common', iconKey: type, shapeKey: type, grouping: false }
});

describe('concept registry', () => {
  it('preserves every legacy rendered/imported concept exactly once', () => {
    expect(CONCEPT_RECORDS.map((record) => record.type).sort()).toEqual(legacyConceptValues);
    expect(new Set(CONCEPT_RECORDS.map((record) => record.canonicalId)).size).toBe(CONCEPT_RECORDS.length);
    expect(new Set(CONCEPT_RECORDS.flatMap((record) => record.aliases)).size)
      .toBe(CONCEPT_RECORDS.flatMap((record) => record.aliases).length);
  });

  it('normalizes legacy qualified types to a canonical concept without changing identity', () => {
    const record = resolveConcept('archimate:ApplicationComponent');
    expect(record).toMatchObject({
      canonicalId: 'concept/application-component',
      type: 'ApplicationComponent',
      layer: 'Application',
      aspect: 'Active structure',
      renderer: { domain: 'application', iconKey: 'ApplicationComponent' }
    });
    expect(resolveConcept('ApplicationComponent')).toBe(record);
    expect(resolveConcept('archimate:UnknownConcept')).toBeUndefined();
    expect(resolveCanonicalConceptId('archimate:ApplicationComponent')).toBe(record?.canonicalId);
    expect(resolveCanonicalConceptId(record?.canonicalId)).toBe(record?.canonicalId);
  });

  it('fails closed when records reuse a canonical ID, type, or alias', () => {
    expect(() => createConceptRegistry([
      syntheticRecord('concept/first', 'First', ['First', 'archimate:First']),
      syntheticRecord('concept/second', 'Second', ['Second', 'archimate:First'])
    ])).toThrow('alias "archimate:First"');
  });

  it('keeps the checked-in renderer compatibility projection deterministic and current', () => {
    const rendered = renderConceptRendererProjection(CONCEPT_RECORDS);
    expect(renderConceptRendererProjection(CONCEPT_RECORDS)).toBe(rendered);
    expect(isConceptRendererProjectionCurrent(projection, CONCEPT_RECORDS)).toBe(true);
    expect(isConceptRendererProjectionCurrent(
      projection.replace('ApplicationComponent', 'ChangedApplicationComponent'),
      CONCEPT_RECORDS
    )).toBe(false);
  });
});
