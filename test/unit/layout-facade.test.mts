import { expect, it } from 'vitest';
import { layoutView, layoutViewInBrowser } from '../../src/layout/index.js';
import type { ModelDto } from '../../src/model-dto/index.js';
import { applyLayoutPatch } from '../../src/model-dto/editor-view.js';

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

function nestedModel(): ModelDto {
  const input = model();
  input.views[0].nodes = [{ id: 'container', kind: 'container', x: 20, y: 30,
    width: 220, height: 150, nodes: [input.views[0].nodes[0]] }, input.views[0].nodes[1]];
  input.views[0].nodes[0].nodes[0].x = 40;
  input.views[0].nodes[0].nodes[0].y = 60;
  input.views[0].nodes[1].id = 'node-b';
  input.views[0].nodes[1].x = 320;
  input.views[0].nodes[1].y = 70;
  input.views[0].connections[0].sourceId = input.views[0].nodes[0].nodes[0].id;
  input.views[0].connections[0].targetId = 'node-b';
  return input;
}

it('lays out nested cross-hierarchy edges with deterministic orthogonal port routes and reversible patches', async () => {
  const input = nestedModel();
  const originalView = structuredClone(input.views[0]);
  const options = { strategy: 'elk-layered' as const };
  const first = await layoutView(input, 'synthetic-view', options);
  const second = await layoutView(input, 'synthetic-view', options);
  expect(first).toEqual(second);
  expect(first.status).toBe('ok');
  if (first.status !== 'ok') return;
  const arranged = first.view;
  const child = arranged.nodes[0].nodes[0];
  const external = arranged.nodes[1];
  expect(child.x).toBeGreaterThanOrEqual(arranged.nodes[0].x);
  expect(child.y).toBeGreaterThanOrEqual(arranged.nodes[0].y);
  expect(arranged.connections[0]).toMatchObject({ relationshipId: 'relationship-1',
    sourceId: child.id, targetId: external.id });
  const route = arranged.connections[0].waypoints;
  expect(route[0]).toMatchObject({ x: child.x + child.width + 4,
    y: child.y + child.height / 2, kind: 'sourceAttachment' });
  expect(route.at(-1)).toMatchObject({ x: external.x - 4,
    y: route[0].y, kind: 'targetAttachment' });
  expect(route.slice(1).every((point, index) => point.x === route[index].x ||
    point.y === route[index].y)).toBe(true);
  const working = structuredClone(originalView);
  const command = { type: 'apply-layout-patch' as const, viewId: originalView.id,
    patch: first.patch, side: 'after' as const };
  applyLayoutPatch(working, command);
  expect(working).toEqual(arranged);
  applyLayoutPatch(working, { ...command, side: 'before' });
  expect(working).toEqual(originalView);
});

it('applies requested first-rank constraints without changing model semantics', async () => {
  const input = model();
  input.views[0].nodes[0].x = 280;
  input.views[0].nodes[1].x = 40;
  const result = await layoutView(input, 'synthetic-view', {
    strategy: 'elk-layered', rankConstraints: [{ nodeId: 'node-b', rank: 'first' }]
  });
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') return;
  expect(result.view.nodes[1].x).toBeLessThan(result.view.nodes[0].x);
  expect(result.view.connections[0].relationshipId).toBe('relationship-1');
  expect(result.view.nodes.map(({ elementId }) => elementId)).toEqual(['concept-a', 'concept-b']);
  const nested = await layoutView(nestedModel(), 'synthetic-view', {
    strategy: 'elk-layered', rankConstraints: [{ nodeId: 'node-a', rank: 'first' }]
  });
  expect(nested.status).toBe('ok');
});

it('returns stable no-partial-result diagnostics for labels and unsupported constraints', async () => {
  const input = model();
  input.views[0].connections[0].label = 'SYNTHETIC edge label';
  const labeled = await layoutView(input, 'synthetic-view', { strategy: 'elk-layered' });
  expect(labeled).toMatchObject({ status: 'unsupported', diagnostics: [
    { code: 'UNSUPPORTED_CONSTRAINT', severity: 'error' }
  ] });
  if (labeled.status !== 'ok') {
    expect('view' in labeled).toBe(false);
    expect('patch' in labeled).toBe(false);
  }
  const incremental = await layoutView(model(), 'synthetic-view', {
    strategy: 'elk-layered', mode: 'incremental', changedNodeIds: ['node-b']
  });
  expect(incremental).toMatchObject({ status: 'unsupported', diagnostics: [
    { code: 'UNSUPPORTED_CONSTRAINT' }
  ] });
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

it('reports overlaps retained by incremental layout as unsatisfied constraints', async () => {
  const input = model();
  input.views[0].nodes[1].x = 40;
  input.views[0].nodes[1].y = 40;
  input.views[0].connections[0].sourceId = 'node-b';
  input.views[0].connections[0].targetId = 'node-a';
  input.relationships[0].sourceId = 'concept-b';
  input.relationships[0].targetId = 'concept-a';
  const options = { strategy: 'builtin' as const, mode: 'incremental' as const,
    changedNodeIds: ['node-b'] };
  const first = await layoutView(input, 'synthetic-view', options);
  const second = await layoutView(input, 'synthetic-view', options);
  expect(first.status).toBe('ok');
  expect(second).toEqual(first);
  if (first.status !== 'ok') return;
  expect(first.metrics.overlapCountAfter).toBeGreaterThan(0);
  expect(first.metrics.violatedConstraintCount).toBeGreaterThanOrEqual(
    first.metrics.overlapCountAfter);
  expect(first.diagnostics).toContainEqual(expect.objectContaining({
    code: 'UNSATISFIED_CONSTRAINT', severity: 'warning'
  }));
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

it('keeps Node and worker-unavailable paths explicit', async () => {
  const input = model();
  const main = await layoutView(input, 'synthetic-view', { strategy: 'builtin' });
  const nodeAuto = await layoutViewInBrowser(input, 'synthetic-view', {
    strategy: 'builtin', workerThresholds: { minNodes: 0 }
  });
  const forced = await layoutViewInBrowser(input, 'synthetic-view', {
    strategy: 'builtin', execution: 'worker'
  });
  expect(nodeAuto).toEqual(main);
  expect(forced).toMatchObject({ status: 'failed', diagnostics: [
    { code: 'WORKER_UNAVAILABLE', severity: 'error' }
  ] });
});
