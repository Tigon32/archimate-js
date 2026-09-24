// SYNTHETIC: Hand-authored DTOs using invented IDs and labels only.
import { expect, it } from 'vitest';
import { diffModelDto } from '../../src/model-dto/index.js';

function fixture() {
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
  const result = diffModelDto(before, after);
  expect(result.impactedViewIds).toEqual(['view']);
  expect(result.changes.map(({ area, entity, id, changedFields }) =>
    [area, entity, id, changedFields])).toEqual([
    ['presentation', 'connection', 'edge', ['waypoints']],
    ['presentation', 'node', 'second', ['x']],
    ['semantic', 'element', 'service', ['name']]
  ]);
  expect(JSON.stringify(before)).toBe(original);
  expect(result).toEqual(diffModelDto(before, after));
  const reordered = structuredClone(after);
  reordered.elements.reverse();
  reordered.views[0].nodes.reverse();
  expect(diffModelDto(before, reordered)).toEqual(result);
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

it('rejects unsupported fields and projection diagnostics without leaking content', () => {
  const source = fixture();
  const unknown = { ...source, confidentialPayload: 'SYNTHETIC_SECRET' };
  const warning = { ...source, diagnostics: [{ code: 'DTO_UNSUPPORTED_FIELDS',
    severity: 'warning', stage: 'projection', message: 'SYNTHETIC_SECRET' }] };
  for (const candidate of [unknown, warning]) {
    expect(() => diffModelDto(candidate, source)).toThrowError(
      'The model DTO cannot be compared without loss.');
    try { diffModelDto(candidate, source); }
    catch (error) {
      expect(error).toMatchObject({ code: 'MODEL_DTO_DIFF_INELIGIBLE' });
      expect(String(error)).not.toContain('SYNTHETIC_SECRET');
    }
  }
});
