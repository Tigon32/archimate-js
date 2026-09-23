import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { validateArchimateXml } from '../../src/validator/index.ts';

const fixtureUrl = new URL('../fixtures/synthetic/minimal-application-view.xml', import.meta.url);

describe('layered ArchiMate XML validator', () => {
  it('accepts the synthetic model and returns a stable semantic summary', async () => {
    const xml = await readFile(fixtureUrl, 'utf8');
    const result = validateArchimateXml(xml, { includeSummary: true });

    expect(result.valid).toBe(true);
    expect(result.summary.elements).toHaveLength(2);
    expect(result.summary.relationships[0]).toMatchObject({
      id: 'serving-relationship-1',
      type: 'ServingRelationship',
      source: 'application-component-1',
      target: 'application-service-1'
    });
    expect(result.suggestions).toEqual([]);
  });

  it('blocks DTD and entity declarations before model interpretation', () => {
    const result = validateArchimateXml('<!DOCTYPE model [<!ENTITY x "secret">]><model id="m"><name>&x;</name></model>');
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain('XML_DTD_FORBIDDEN');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('reports malformed XML and unknown relationship types without echoing content', () => {
    const malformed = validateArchimateXml('<model id="model-secret"><elements></model>');
    const unknownType = validateArchimateXml(`
      <model id="model-secret"><elements>
        <element id="element-secret" xsi:type="archimate:UnlistedElement" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" />
      </elements><relationships>
        <relationship id="relationship-secret" source="element-secret" target="element-secret" xsi:type="archimate:UnknownRelationship" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" />
      </relationships></model>
    `);

    expect(malformed.diagnostics.map(({ code }) => code)).toContain('XML_MALFORMED');
    expect(unknownType.diagnostics.map(({ code }) => code)).toContain('SEMANTICS_ELEMENT_TYPE_UNKNOWN');
    expect(unknownType.diagnostics.map(({ code }) => code)).toContain('SEMANTICS_RELATIONSHIP_TYPE_UNKNOWN');
    expect(JSON.stringify([malformed, unknownType])).not.toContain('secret');
  });

  it('returns deterministic unresolved-reference diagnostics and review-only suggestions', async () => {
    const xml = await readFile(new URL('../fixtures/synthetic/invalid-reference.xml', import.meta.url), 'utf8');
    const first = validateArchimateXml(xml);
    const second = validateArchimateXml(xml);

    expect(first.valid).toBe(false);
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics.map(({ code }) => code)).toContain('STRUCTURE_REFERENCE_UNRESOLVED');
    expect(first.suggestions.every(({ operation }) => operation === 'review-reference')).toBe(true);
    expect(xml).toContain('missing-element');
  });

  it('enforces bounded size and nesting with safe messages', () => {
    const large = validateArchimateXml('<model id="m"/>', { maxXmlBytes: 8 });
    const deep = validateArchimateXml('<model id="m"><a><b/></a></model>', { maxDepth: 2 });

    expect(large.diagnostics[0].code).toBe('XML_SIZE_LIMIT');
    expect(deep.diagnostics.map(({ code }) => code)).toContain('XML_DEPTH_LIMIT');
    expect(JSON.stringify([large, deep])).not.toContain('<model');
  });

  it('runs opt-in organization quality rules without disclosing thrown values', async () => {
    const xml = await readFile(fixtureUrl, 'utf8');
    const result = validateArchimateXml(xml, {
      includeSummary: true,
      organizationRules: [
        { code: 'ORG_REQUIRE_ONE_VIEW', message: 'Review report view count.', check: (model) => model.views.length === 1 },
        { code: 'ORG_PRIVATE_RULE', message: 'Review the organization-specific rule.', check: () => { throw new Error('private model detail'); } }
      ]
    });

    expect(result.diagnostics.map(({ code }) => code)).toContain('QUALITY_RULE_FAILED');
    expect(JSON.stringify(result)).not.toContain('private model detail');
  });

  it('does not mutate source or return executable repair actions', async () => {
    const xml = await readFile(fixtureUrl, 'utf8');
    const before = xml;
    validateArchimateXml(xml);
    expect(xml).toBe(before);
  });

  it('omits model identifiers and summaries from the default result', async () => {
    const xml = await readFile(fixtureUrl, 'utf8');
    const result = validateArchimateXml(xml);

    expect(result.summary).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('application-component-1');
  });
});
