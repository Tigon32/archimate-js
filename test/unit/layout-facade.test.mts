import { expect, it } from 'vitest';
import { layoutView } from '../../src/layout/index.js';
import type { ModelDto } from '../../src/model-dto/index.js';

// SYNTHETIC: DTO geometry and semantic references only.
function model(): ModelDto {
  return { schemaVersion: 1, id: 'synthetic-model', diagnostics: [],
    elements: [{ id: 'concept-a', type: 'BusinessActor' },
      { id: 'concept-b', type: 'BusinessRole' }],
    relationships: [{ id: 'relationship-1', type: 'AssignmentRelationship',
      sourceId: 'concept-a', targetId: 'concept-b' }],
    views: [{ id: 'synthetic-view', name: 'Authored view',
      nodes: [
        { id: 'node-a', kind: 'element', elementId: 'concept-a',
          label: 'A', x: 40, y: 40, width: 100, height: 50,
          style: { fill: '#112233' }, nodes: [] },
        { id: 'node-b', kind: 'element', elementId: 'concept-b',
          label: 'B', x: 50, y: 45, width: 100, height: 50, nodes: [] }
      ], connections: [{ id: 'edge-1', kind: 'relationship',
        relationshipId: 'relationship-1', sourceId: 'node-a', targetId: 'node-b',
        waypoints: [{ x: 140, y: 65 }, { x: 50, y: 70 }] }] }] };
}

it('returns detached DTO geometry and an invertible patch with optimizer metrics', async () => {
    const input = model();
    const before = JSON.stringify(input);
    const result = await layoutView(input, 'synthetic-view', { strategy: 'builtin' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(JSON.stringify(input)).toBe(before);
    expect(result.metrics.movedNodeCount).toBe(result.patch.nodes.length);
    expect(result.metrics.reroutedConnectionCount).toBe(result.patch.connections.length);
    expect(result.metrics.overlapCountBefore).toBe(1);
    expect(result.metrics.overlapCountAfter).toBe(0);
    expect(result.view.nodes[0].style).toEqual(input.views[0].nodes[0].style);
    expect(result.view.nodes[0].elementId).toBe('concept-a');
    expect(result.view.connections[0].relationshipId).toBe('relationship-1');
    expect(result.view.nodes[0]).not.toBe(input.views[0].nodes[0]);
    for (const entry of result.patch.nodes) {
      const old = input.views[0].nodes.find((node) => node.id === entry.id);
      const next = result.view.nodes.find((node) => node.id === entry.id);
      expect(entry.before).toEqual({ x: old?.x, y: old?.y,
        width: old?.width, height: old?.height });
      expect(entry.after).toEqual({ x: next?.x, y: next?.y,
        width: next?.width, height: next?.height });
    }
    expect(result.patch.connections[0].before).toEqual(input.views[0].connections[0].waypoints);
    expect(result.patch.connections[0].after).toEqual(result.view.connections[0].waypoints);
    expect(result.patch.connections[0].after[0].kind).toBe('sourceAttachment');
    expect(result.patch.connections[0].after.at(-1)?.kind).toBe('targetAttachment');
    expect(result.patch.connections[0].after.every((point) =>
      Number.isInteger(point.x) && Number.isInteger(point.y))).toBe(true);
});

it('preserves authored waypoint kinds and styles when routing is disabled', async () => {
    const input = model();
    input.views[0].connections[0].waypoints[0].kind = 'sourceAttachment';
    input.views[0].connections[0].style = { stroke: '#778899' };
    const result = await layoutView(input, 'synthetic-view', {
      strategy: 'builtin', routeConnections: false
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.view.connections[0].waypoints).toEqual(input.views[0].connections[0].waypoints);
    expect(result.view.connections[0].style).toEqual({ stroke: '#778899' });
    expect(result.view.connections[0].waypoints).not.toBe(input.views[0].connections[0].waypoints);
});

it('rejects unavailable requests explicitly and preserves source geometry', async () => {
    const input = model();
    const before = JSON.stringify(input);
    const options = [
      [{ strategy: 'elk-layered' }, 'UNSUPPORTED_STRATEGY'],
      [{ strategy: 'builtin', mode: 'incremental' }, 'INVALID_OPTIONS'],
      [{ strategy: 'builtin', hardPins: [] }, 'INVALID_OPTIONS']
    ] as const;
    for (const [request, code] of options) {
      const result = await layoutView(input, 'synthetic-view', request as never);
      expect(result.status).not.toBe('ok');
      if (result.status === 'ok') continue;
      expect(result.diagnostics[0].code).toBe(code);
      expect('view' in result).toBe(false);
      expect('patch' in result).toBe(false);
      expect('metrics' in result).toBe(false);
    }
    expect(JSON.stringify(input)).toBe(before);
});

it('keeps hard-pinned nodes fixed and reroutes connections around their final geometry', async () => {
  const input = model();
  const before = JSON.stringify(input);
  const result = await layoutView(input, 'synthetic-view', {
    strategy: 'builtin', pins: [{ nodeId: 'node-b', strength: 'hard' }]
  });
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') return;
  expect(JSON.stringify(input)).toBe(before);
  expect(result.view.nodes[1]).toMatchObject({ x: 50, y: 45, width: 100, height: 50 });
  expect(result.metrics.pinDisplacements).toEqual([
    { nodeId: 'node-b', strength: 'hard', distance: 0 }
  ]);
  expect(result.metrics.unaffectedNodeDisplacement).toBe(0);
  expect(result.view.connections[0].waypoints[0]).toMatchObject({ kind: 'sourceAttachment' });
  expect(result.view.connections[0].waypoints.at(-1)).toMatchObject({ kind: 'targetAttachment' });
});

it('keeps a hard-pinned container and its nested subtree unchanged', async () => {
  const input = model();
  const children = input.views[0].nodes;
  input.views[0].nodes = [{ id: 'container', kind: 'container', x: 0, y: 0,
    width: 220, height: 150, nodes: children }];
  const before = JSON.stringify(input.views[0].nodes);
  const result = await layoutView(input, 'synthetic-view', {
    strategy: 'builtin', pins: [{ nodeId: 'container', strength: 'hard' }]
  });
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') return;
  expect(result.view.nodes).toEqual(input.views[0].nodes);
  expect(JSON.stringify(input.views[0].nodes)).toBe(before);
  expect(result.patch.nodes).toEqual([]);
});

it('reports soft-pin displacement in metrics and a stable warning', async () => {
  const input = model();
  const result = await layoutView(input, 'synthetic-view', {
    strategy: 'builtin', pins: [{ nodeId: 'node-b', strength: 'soft' }]
  });
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') return;
  const pin = result.metrics.pinDisplacements[0];
  expect(pin.strength).toBe('soft');
  expect(pin.distance).toBeGreaterThan(0);
  expect(result.metrics.softPinDisplacement).toBe(pin.distance);
  expect(result.diagnostics).toEqual([expect.objectContaining({
    code: 'SOFT_PIN_DISPLACED', severity: 'warning'
  })]);
});

it('incremental layout preserves unchanged nodes and reports their displacement', async () => {
  const input = model();
  const options = { strategy: 'builtin' as const, mode: 'incremental' as const,
    changedNodeIds: ['node-b'] };
  const first = await layoutView(input, 'synthetic-view', options);
  const second = await layoutView(input, 'synthetic-view', options);
  expect(first.status).toBe('ok');
  expect(second).toEqual(first);
  if (first.status !== 'ok') return;
  expect(first.view.nodes[0]).toMatchObject({ x: 40, y: 40, width: 100, height: 50 });
  expect(first.metrics.unaffectedNodeDisplacement).toBe(0);
  expect(first.metrics.movedNodeCount).toBe(1);
});

it('rejects missing pin targets and malformed incremental requests explicitly', async () => {
  const input = model();
  const missingPin = await layoutView(input, 'synthetic-view', {
    strategy: 'builtin', pins: [{ nodeId: 'missing', strength: 'hard' }]
  });
  const missingChanged = await layoutView(input, 'synthetic-view', {
    strategy: 'builtin', mode: 'incremental', changedNodeIds: ['missing']
  });
  const malformed = await layoutView(input, 'synthetic-view', {
    strategy: 'builtin', pins: [{ nodeId: 'node-a', strength: 'soft', weight: 0.5 } as never]
  });
  expect(missingPin).toMatchObject({ status: 'invalid', diagnostics: [
    { code: 'PIN_NODE_NOT_FOUND' }
  ] });
  expect(missingChanged).toMatchObject({ status: 'invalid', diagnostics: [
    { code: 'CHANGED_NODE_NOT_FOUND' }
  ] });
  expect(malformed).toMatchObject({ status: 'invalid', diagnostics: [
    { code: 'INVALID_OPTIONS' }
  ] });
});

it('rejects missing endpoints and invalid DTOs without modifying the original', async () => {
    const input = model();
    input.views[0].connections[0].kind = 'line';
    delete input.views[0].connections[0].relationshipId;
    delete input.views[0].connections[0].targetId;
    const unsupported = await layoutView(input, 'synthetic-view', { strategy: 'builtin' });
    expect(unsupported.status).toBe('unsupported');
    if (unsupported.status !== 'ok') expect(unsupported.diagnostics[0].code).toBe('UNSUPPORTED_CONNECTION');
    input.views[0].nodes[0].width = -1;
    const invalid = await layoutView(input, 'synthetic-view', { strategy: 'builtin' });
    expect(invalid.status).toBe('invalid');
    if (invalid.status !== 'ok') expect(invalid.diagnostics[0].code).toBe('INVALID_MODEL');
});
