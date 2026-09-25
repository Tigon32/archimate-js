// SYNTHETIC: Hand-authored DTOs with invented IDs, names, and geometry only.
import { expect, it } from 'vitest';
import { renderModelDtoDiffOverlay } from '../../src/model-dto/index.js';
import type { ModelDto } from '../../src/model-dto/index.js';

function fixture(): ModelDto {
  return {
    schemaVersion: 1, id: 'synthetic-model', diagnostics: [],
    elements: [
      { id: 'stable-element', type: 'archimate:ApplicationComponent', name: 'SYNTHETIC LABEL' },
      { id: 'removed-element', type: 'archimate:ApplicationService', name: 'SYNTHETIC REMOVED' },
      { id: 'changed-element', type: 'archimate:ApplicationService', name: 'SYNTHETIC BEFORE' }
    ],
    relationships: [
      { id: 'changed-relationship', type: 'archimate:Serving', sourceId: 'changed-element',
        targetId: 'stable-element' },
      { id: 'removed-relationship', type: 'archimate:Flow', sourceId: 'stable-element',
        targetId: 'changed-element' }
    ],
    views: [{ id: 'synthetic-view', name: 'SYNTHETIC VIEW LABEL', nodes: [
      { id: 'move-node', kind: 'element', elementId: 'stable-element',
        x: 10, y: 20, width: 100, height: 40, nodes: [] },
      { id: 'remove-node', kind: 'element', elementId: 'removed-element',
        x: 130, y: 20, width: 100, height: 40, nodes: [] },
      { id: 'semantic-node', kind: 'element', elementId: 'changed-element',
        x: 260, y: 20, width: 100, height: 40, nodes: [] }
    ], connections: [
      { id: 'reroute-edge', kind: 'relationship', relationshipId: 'changed-relationship',
        sourceId: 'semantic-node', targetId: 'move-node',
        waypoints: [{ x: 110, y: 40 }, { x: 260, y: 40 }] },
      { id: 'semantic-edge', kind: 'relationship', relationshipId: 'changed-relationship',
        sourceId: 'semantic-node', targetId: 'move-node',
        waypoints: [{ x: 110, y: 50 }, { x: 260, y: 50 }] },
      { id: 'remove-edge', kind: 'relationship', relationshipId: 'removed-relationship',
        sourceId: 'move-node', targetId: 'semantic-node',
        waypoints: [{ x: 260, y: 60 }, { x: 110, y: 60 }] }
    ] }]
  };
}

it('renders deterministic content-free geometry for view and semantic changes', () => {
  const before = fixture();
  const after = structuredClone(before);
  const beforeBytes = JSON.stringify(before);
  after.elements.find(({ id }) => id === 'changed-element')!.name = 'SYNTHETIC AFTER LABEL';
  after.relationships[0].type = 'archimate:Flow';
  after.elements = after.elements.filter(({ id }) => id !== 'removed-element');
  after.elements.push({ id: 'added-element', type: 'archimate:ApplicationService',
    name: 'SYNTHETIC ADDED LABEL' });
  const view = after.views[0];
  view.nodes = view.nodes.filter(({ id }) => id !== 'remove-node');
  view.nodes[0].x = 25;
  view.nodes.push({ id: 'add-node', kind: 'element', elementId: 'added-element',
    x: 400, y: 20, width: 100, height: 40, nodes: [] });
  view.connections = view.connections.filter(({ id }) => id !== 'remove-edge');
  for (const connection of view.connections) {
    connection.sourceId = 'semantic-node';
    connection.targetId = 'move-node';
  }
  view.connections[0].waypoints = [{ x: 125, y: 40 }, { x: 180, y: 55 }, { x: 260, y: 40 }];
  view.connections.push({ id: 'add-edge', kind: 'relationship',
    relationshipId: 'changed-relationship', sourceId: 'semantic-node', targetId: 'move-node',
    waypoints: [{ x: 125, y: 70 }, { x: 260, y: 70 }] });
  const afterBytes = JSON.stringify(after);

  const svg = renderModelDtoDiffOverlay(before, after, 'synthetic-view');
  expect(svg).toBe(renderModelDtoDiffOverlay(before, after, 'synthetic-view'));
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  expect(svg).toContain('<rect class="archimate-diff-shape archimate-diff-added"');
  expect(svg).toContain('<rect class="archimate-diff-shape archimate-diff-removed"');
  expect(svg).toContain('archimate-diff-modified archimate-diff-before');
  expect(svg).toContain('archimate-diff-modified archimate-diff-after');
  expect(svg).toContain('aria-label="modified diagram node before" x="10" y="20" width="100" height="40"');
  expect(svg).toContain('aria-label="modified diagram node after" x="25" y="20" width="100" height="40"');
  expect(svg).toContain('aria-label="modified diagram connection before" d="M 110 40 L 260 40"');
  expect(svg).toContain('aria-label="modified diagram connection after" d="M 125 40 L 180 55 L 260 40"');
  expect(svg).toContain('<path class="archimate-diff-shape archimate-diff-added"');
  expect(svg).toContain('<path class="archimate-diff-shape archimate-diff-removed"');
  expect(svg).toContain('aria-label="modified diagram node"');
  for (const privateLookingValue of ['synthetic-model', 'synthetic-view', 'move-node',
    'changed-element', 'changed-relationship', 'SYNTHETIC']) {
    expect(svg).not.toContain(privateLookingValue);
  }
  expect(JSON.stringify(before)).toBe(beforeBytes);
  expect(JSON.stringify(after)).toBe(afterBytes);
});

it('rejects ineligible inputs through the content-free diff boundary', () => {
  const ineligible = { ...fixture(), diagnostics: [{ code: 'DTO_UNSUPPORTED_FIELDS',
    severity: 'warning', stage: 'projection', message: 'SYNTHETIC PRIVATE VALUE' }] };
  expect(() => renderModelDtoDiffOverlay(ineligible, fixture(), 'synthetic-view'))
    .toThrowError('The model DTO cannot be compared without loss.');
  try { renderModelDtoDiffOverlay(ineligible, fixture(), 'synthetic-view'); }
  catch (error) {
    expect(error).toMatchObject({ code: 'MODEL_DTO_DIFF_INELIGIBLE' });
    expect(String(error)).not.toContain('SYNTHETIC PRIVATE VALUE');
  }
});

it('rejects views absent from both eligible DTOs', () => {
  expect(() => renderModelDtoDiffOverlay(fixture(), fixture(), 'missing-view'))
    .toThrowError('The requested view is not present in either DTO.');
});
