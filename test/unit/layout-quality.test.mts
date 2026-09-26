import { expect, it } from 'vitest';

import { layoutView } from '../../src/layout/index.js';
import { layoutQualityCorpus } from '../../src/layout/quality-corpus.js';
import { computeLayoutQualityMetrics, deterministicQualityMetrics } from '../../src/layout/quality-metrics.js';
import { renderLayoutQualitySvg } from '../../src/layout/quality-svg.js';
import type { ViewDto } from '../../src/model-dto/index.js';

function metricProbeViews(): { before: ViewDto; after: ViewDto } {
  const before: ViewDto = { id: 'probe', nodes: [
    { id: 'pin', kind: 'element', elementId: 'pin-concept', x: 0, y: 0, width: 50, height: 40, label: 'Pinned', nodes: [] }
  ], connections: [] };
  const after: ViewDto = { id: 'probe', nodes: [
    { id: 'pin', kind: 'element', elementId: 'pin-concept', x: 20, y: 0, width: 50, height: 40, label: 'Pinned', nodes: [] },
    { id: 'overlap-a', kind: 'element', elementId: 'a', x: 80, y: 0, width: 80, height: 50, label: 'Same', nodes: [] },
    { id: 'overlap-b', kind: 'element', elementId: 'b', x: 100, y: 20, width: 80, height: 50, label: 'Same', nodes: [] },
    { id: 'box', kind: 'container', x: 220, y: 0, width: 80, height: 80, label: 'Box',
      nodes: [{ id: 'outside', kind: 'element', elementId: 'child', x: 290, y: 50,
        width: 60, height: 40, label: 'Child', nodes: [] }] }
  ], connections: [
    { id: 'cross-1', kind: 'line', sourceId: 'pin', targetId: 'overlap-b',
      waypoints: [{ x: 0, y: 100 }, { x: 220, y: 100 }] },
    { id: 'cross-2', kind: 'line', sourceId: 'overlap-a', targetId: 'box',
      waypoints: [{ x: 110, y: 40 }, { x: 110, y: 150 }] },
    { id: 'shared-1', kind: 'line', sourceId: 'pin', targetId: 'box',
      waypoints: [{ x: 0, y: 120 }, { x: 80, y: 120 }, { x: 80, y: 180 }] },
    { id: 'shared-2', kind: 'line', sourceId: 'overlap-a', targetId: 'outside',
      waypoints: [{ x: 40, y: 120 }, { x: 120, y: 120 }] }
  ] };
  return { before, after };
}

it('reports raw layout-quality metrics with duration isolated from deterministic comparison', () => {
  const { before, after } = metricProbeViews();
  const metrics = computeLayoutQualityMetrics(before, after, {
    pins: [{ nodeId: 'pin', strength: 'hard' }], durationMs: 123.456
  });
  expect(metrics).toMatchObject({ durationMs: 123.456, durationRuntimeSensitive: true });
  expect(metrics.nodeOverlapCount).toBeGreaterThan(0);
  expect(metrics.containmentViolationCount).toBeGreaterThan(0);
  expect(metrics.edgeNodeIntersectionCount).toBeGreaterThan(0);
  expect(metrics.edgeCrossingCount).toBeGreaterThan(0);
  expect(metrics.sharedSegmentCount).toBeGreaterThan(0);
  expect(metrics.totalBendCount).toBeGreaterThan(0);
  expect(metrics.totalEdgeLength).toBeGreaterThan(0);
  expect(metrics.meanEdgeLength).toBeGreaterThan(0);
  expect(metrics.labelOverlapCount).toBeGreaterThan(0);
  expect(metrics.layoutWidth).toBeGreaterThan(0);
  expect(metrics.layoutHeight).toBeGreaterThan(0);
  expect(metrics.movedNodeCount).toBe(1);
  expect(metrics.hardPinViolationCount).toBe(1);
  expect(metrics.violatedConstraintCount).toBeGreaterThan(0);
  expect(deterministicQualityMetrics(metrics)).toEqual(deterministicQualityMetrics({
    ...metrics, durationMs: 999
  }));
});

it('provides a provenance-marked synthetic corpus covering the required topologies', () => {
  const corpus = layoutQualityCorpus();
  expect(corpus.every((item) => item.provenance === 'SYNTHETIC')).toBe(true);
  const coverage = new Set(corpus.flatMap((item) => item.coverage));
  expect(coverage).toEqual(new Set(['nested groups', 'cross-hierarchy edges', 'labels',
    'cycles', 'multi-edges', 'self-loops', 'dense views', 'pins']));
});

it('keeps quality metrics and SVG snapshots deterministic for fixed strategy inputs', async () => {
  const corpus = layoutQualityCorpus();
  const item = corpus[0];
  for (const strategy of ['builtin', 'elk-layered'] as const) {
    const first = await layoutView(item.model, item.viewId, { strategy });
    const second = await layoutView(item.model, item.viewId, { strategy });
    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    if (first.status !== 'ok' || second.status !== 'ok') continue;
    const source = item.model.views[0];
    const firstMetrics = computeLayoutQualityMetrics(source, first.view, { durationMs: 1 });
    const secondMetrics = computeLayoutQualityMetrics(source, second.view, { durationMs: 2 });
    expect(deterministicQualityMetrics(firstMetrics)).toEqual(deterministicQualityMetrics(secondMetrics));
    expect(renderLayoutQualitySvg(first.view, `${item.id} ${strategy}`))
      .toBe(renderLayoutQualitySvg(second.view, `${item.id} ${strategy}`));
  }
});
