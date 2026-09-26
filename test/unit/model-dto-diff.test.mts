// SYNTHETIC: Hand-authored DTOs using invented IDs and labels only.
import { expect, it } from 'vitest';
import { assessModelDtoDiffEligibility, diffModelDto } from '../../src/model-dto/index.js';
import type { ModelDto } from '../../src/model-dto/index.js';

function fixture(): ModelDto {
  return {
    schemaVersion: 1 as const, id: 'model-example', diagnostics: [],
    elements: [
      { id: 'app', type: 'archimate:ApplicationComponent', name: 'Example App' },
      { id: 'service', type: 'archimate:ApplicationService', name: 'Example Service' }
    ],
    relationships: [{
      id: 'serving', type: 'archimate:Serving', sourceId: 'service', targetId: 'app'
    }],
    views: [{
      id: 'view', name: 'Example', nodes: [
        { id: 'first', kind: 'element' as const, elementId: 'service',
          x: 0, y: 0, width: 100, height: 40, nodes: [] },
        { id: 'second', kind: 'element' as const, elementId: 'service',
          x: 0, y: 50, width: 100, height: 40, nodes: [] },
        { id: 'app-node', kind: 'element' as const, elementId: 'app',
          x: 200, y: 0, width: 100, height: 40, nodes: [] }
      ],
      connections: [{
        id: 'edge', kind: 'relationship' as const, relationshipId: 'serving',
        sourceId: 'first', targetId: 'app-node',
        waypoints: [{ x: 100, y: 20 }, { x: 200, y: 20 }]
      }]
    }]
  };
}

it('reports stable semantic and presentation changes across repeated appearances', () => {
  const before = fixture();
  const after = structuredClone(before);
  const original = JSON.stringify(before);
  after.elements[1].name = 'Renamed Service';
  after.views[0].nodes[1].x = 30;
  after.views[0].connections[0].waypoints[1].y = 70;
  const afterOriginal = JSON.stringify(after);
  const result = diffModelDto(before, after);
  expect(result.renameCandidates).toBeUndefined();
  expect(result.impactedViewIds).toEqual(['view']);
  expect(result.changes.map(({ area, entity, id, changedFields }) =>
    [area, entity, id, changedFields])).toEqual([
    ['presentation', 'connection', 'edge', ['waypoints']],
    ['presentation', 'node', 'second', ['x']],
    ['semantic', 'element', 'service', ['name']]
  ]);
  expect(JSON.stringify(before)).toBe(original);
  expect(JSON.stringify(after)).toBe(afterOriginal);
  expect(result).toEqual(diffModelDto(before, after));
  const reordered = structuredClone(after);
  reordered.elements.reverse();
  reordered.views[0].nodes.reverse();
  expect(diffModelDto(before, reordered)).toEqual(result);
});

it('aggregates impacted views for semantic IDs in sorted order', () => {
  const before = fixture();
  before.views.unshift({ id: 'a-view', name: 'Second view', nodes: [{
    id: 'another-instance', kind: 'element', elementId: 'service',
    x: 0, y: 0, width: 100, height: 40, nodes: []
  }], connections: [] });
  const after = structuredClone(before);
  after.elements[1].name = 'Updated';
  after.relationships[0].type = 'archimate:Flow';
  const afterOriginal = JSON.stringify(after);
  const result = diffModelDto(before, after);
  expect(result.impactedViewIds).toEqual(['a-view', 'view']);
  expect(result.changes.filter((change) => change.area === 'semantic').map((change) =>
    [change.entity, change.id])).toEqual([
    ['element', 'service'], ['relationship', 'serving']
  ]);
  expect(JSON.stringify(after)).toBe(afterOriginal);
});

it('ignores collection order but detects additions and removals by ID', () => {
  const before = fixture();
  const reordered = structuredClone(before);
  reordered.elements.reverse();
  reordered.views[0].nodes.reverse();
  expect(diffModelDto(before, reordered).changes).toEqual([]);
  const after = structuredClone(before);
  after.elements.push({ id: 'new-app', type: 'archimate:ApplicationComponent',
    name: 'New App' });
  after.views[0].nodes = after.views[0].nodes.filter((node) => node.id !== 'second');
  expect(diffModelDto(before, after).changes.map(({ entity, kind, id }) =>
    [entity, kind, id])).toEqual([
    ['node', 'removed', 'second'], ['element', 'added', 'new-app']
  ]);
});

it('reports a unique same-content element rename without changing ID-based changes', () => {
  const before = fixture();
  const after = structuredClone(before);
  const originalBefore = JSON.stringify(before);
  after.elements[1] = { ...after.elements[1], id: 'service-v2', name: 'Renamed Service' };
  after.relationships[0].sourceId = 'service-v2';
  for (const node of after.views[0].nodes) {
    if (node.elementId === 'service') node.elementId = 'service-v2';
  }
  const originalAfter = JSON.stringify(after);
  const result = diffModelDto(before, after);
  expect(result.renameCandidates).toEqual([{
    beforeId: 'service', afterId: 'service-v2',
    heuristic: true, confidence: 0.9,
    reason: 'unique-content-match-except-id-and-name'
  }]);
  expect(result.changes.filter(({ entity }) => entity === 'element').map(({ id, kind }) =>
    [kind, id])).toEqual([['removed', 'service'], ['added', 'service-v2']]);
  expect(JSON.stringify(result.renameCandidates)).not.toContain('Renamed Service');
  expect(JSON.stringify(before)).toBe(originalBefore);
  expect(JSON.stringify(after)).toBe(originalAfter);
  expect(result).toEqual(diffModelDto(before, after));
});

it('does not infer ambiguous or edited elements as rename candidates', () => {
  const before = fixture();
  before.elements.push(
    { id: 'removed-a', type: 'archimate:ApplicationService', name: 'Old A' },
    { id: 'removed-b', type: 'archimate:ApplicationService', name: 'Old B' }
  );
  const ambiguous = structuredClone(before);
  ambiguous.elements = ambiguous.elements.filter((element) =>
    element.id !== 'removed-a' && element.id !== 'removed-b');
  ambiguous.elements.push(
    { id: 'added-a', type: 'archimate:ApplicationService', name: 'New A' },
    { id: 'added-b', type: 'archimate:ApplicationService', name: 'New B' }
  );
  const ambiguousDiff = diffModelDto(before, ambiguous);
  expect(ambiguousDiff.renameCandidates).toBeUndefined();
  expect(ambiguousDiff.changes.filter(({ entity }) => entity === 'element').map(({ id, kind }) =>
    [kind, id])).toEqual([
    ['added', 'added-a'], ['added', 'added-b'], ['removed', 'removed-a'], ['removed', 'removed-b']
  ]);

  const editedBefore = fixture();
  editedBefore.elements.push({ id: 'old-detached', type: 'archimate:ApplicationService',
    name: 'Old name', documentation: 'Same synthetic documentation' });
  const editedAfter = structuredClone(editedBefore);
  editedAfter.elements = editedAfter.elements.filter((element) => element.id !== 'old-detached');
  editedAfter.elements.push({ id: 'new-detached', type: 'archimate:ApplicationService',
    name: 'New name', documentation: 'Changed synthetic documentation' });
  expect(diffModelDto(editedBefore, editedAfter).renameCandidates).toBeUndefined();
});

it('rejects unsupported fields and projection diagnostics without leaking content', () => {
  const source = fixture();
  const unknown = { ...source, confidentialPayload: 'SYNTHETIC_SECRET' };
  const cyclic = { ...source, omitted: {} as Record<string, unknown> };
  cyclic.omitted.self = cyclic.omitted;
  const warning = { ...source, diagnostics: [{ code: 'DTO_UNSUPPORTED_FIELDS',
    severity: 'warning', stage: 'projection', message: 'SYNTHETIC_SECRET' }] };
  for (const candidate of [unknown, cyclic, warning]) {
    expect(() => diffModelDto(candidate, source)).toThrowError(
      'The model DTO cannot be compared without loss.');
    try { diffModelDto(candidate, source); }
    catch (error) {
      expect(error).toMatchObject({ code: 'MODEL_DTO_DIFF_INELIGIBLE' });
      expect(String(error)).not.toContain('SYNTHETIC_SECRET');
    }
  }
});

it('provides deterministic content-free diagnostics for ineligible inputs', () => {
  const before = { ...fixture(), SYNTHETIC_SECRET_PAYLOAD_KEY: 'SYNTHETIC_SECRET',
    secondPrivateLookingField: 'SYNTHETIC_SECRET', diagnostics: [{
      code: 'SYNTHETIC_SECRET_PAYLOAD_CODE', severity: 'warning', stage: 'projection',
      message: 'SYNTHETIC_SECRET'
    }] };
  const after = { ...fixture(), diagnostics: [{ code: 'DTO_UNSUPPORTED_FIELDS',
    severity: 'warning', stage: 'projection', message: 'SYNTHETIC_SECRET' }] };
  const result = assessModelDtoDiffEligibility(before, after);
  expect(result).toEqual({ eligible: false, diagnostics: [
    { input: 'before', code: 'MODEL_DTO_DIFF_LOSSY_PROJECTION', count: 1,
      details: ['unknown-construct'] },
    { input: 'before', code: 'MODEL_DTO_DIFF_UNSUPPORTED_FIELDS', count: 2,
      details: ['/unknown-field'] },
    { input: 'after', code: 'MODEL_DTO_DIFF_LOSSY_PROJECTION', count: 1,
      details: ['DTO_UNSUPPORTED_FIELDS'] }
  ] });
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET');
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET_PAYLOAD_KEY');
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET_PAYLOAD_CODE');
  expect(result).toEqual(assessModelDtoDiffEligibility(before, after));
});

it('rejects sparse DTO arrays and enumerable custom array fields without leaking values', () => {
  const sparse = { ...fixture(), diagnostics: new Array<unknown>(1) };
  const custom = fixture();
  Object.assign(custom.elements, { syntheticPrivateField: 'SYNTHETIC_SECRET' });
  const result = assessModelDtoDiffEligibility(sparse, custom);
  expect(result).toEqual({ eligible: false, diagnostics: [
    { input: 'before', code: 'MODEL_DTO_DIFF_UNSUPPORTED_FIELDS', count: 1,
      details: ['/diagnostics/unknown-field'] },
    { input: 'after', code: 'MODEL_DTO_DIFF_UNSUPPORTED_FIELDS', count: 1,
      details: ['/elements/unknown-field'] }
  ] });
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET');
  expect(() => diffModelDto(sparse, fixture())).toThrowError(
    'The model DTO cannot be compared without loss.');
  expect(() => diffModelDto(custom, fixture())).toThrowError(
    'The model DTO cannot be compared without loss.');
});

it('rejects enumerable symbol fields on DTO records without leaking values', () => {
  const source = fixture();
  const marker = Symbol('SYNTHETIC_SECRET');
  Object.defineProperty(source.elements[0], marker, {
    enumerable: true, value: 'SYNTHETIC_SECRET'
  });
  const result = assessModelDtoDiffEligibility(source, fixture());
  expect(result).toEqual({ eligible: false, diagnostics: [
    { input: 'before', code: 'MODEL_DTO_DIFF_UNSUPPORTED_FIELDS', count: 1,
      details: ['/elements/unknown-field'] }
  ] });
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET');
  expect(() => diffModelDto(source, fixture())).toThrowError(
    'The model DTO cannot be compared without loss.');
});

it('preserves invalid DTO errors while inspecting eligibility', () => {
  const invalid = { ...fixture(), id: 'not valid' };
  expect(() => assessModelDtoDiffEligibility(invalid, fixture())).toThrowError(
    'The model DTO is invalid.');
  try { assessModelDtoDiffEligibility(invalid, fixture()); }
  catch (error) { expect(error).toMatchObject({ code: 'MODEL_DTO_INVALID' }); }
});
