/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { routeViewConnections } from '../../lib/layout/route-view-connections.mjs';
import { applyLayoutPatch, optimizeDiagram } from '../../lib/layout/optimize-diagram.mjs';
import OptimizeDiagramHandler from '../../lib/features/modeling/cmd/OptimizeDiagramHandler.js';
import ArchimateRenderer from '../../lib/draw/ArchimateRenderer.js';
import { createSvg } from '../../lib/util/SvgExportUtil.mjs';
import Modeler from '../../lib/Modeler.js';
import Modeling from '../../lib/features/modeling/Modeling.js';

// Fixture provenance: SYNTHETIC, designed solely for geometry regression.
const node = (id, x, y, w = 90, h = 60, extra = {}) =>
  ({ $type: 'archimate:Node', id, x, y, w, h, nodes: [], ...extra });
const edge = (id, source, target, type = 'Serving', points = []) => ({
  $type: 'archimate:Connection', id, source, target, type,
  relationshipRef: { id: `model-${id}`, type },
  waypointsNode: { waypoints: points }
});

describe('orthogonal routing (SYNTHETIC)', () => {
  it('distributes ports, avoids a blocker, keeps lanes separate, and is deterministic', () => {
    const nodes = [node('source', 0, 0), node('target', 320, 0), node('blocker', 140, -20, 100, 100)];
    const connections = [
      { id: 'one', source: 'source', target: 'target', waypoints: [{ x: 999, y: 999 }] },
      { id: 'two', source: 'source', target: 'target' }
    ];
    const a = routeViewConnections({ nodes, connections });
    const b = routeViewConnections({ nodes, connections });
    expect(a).toEqual(b);
    expect(connections[0].waypoints).toEqual([{ x: 999, y: 999 }]);
    expect(a.connections[0].waypoints[0].x).toBe(90);
    expect(a.connections[0].waypoints.at(-1).x).toBe(320);
    expect(a.connections[0].waypoints[0].y).not.toBe(a.connections[1].waypoints[0].y);
    expect(a.metrics).toEqual({
      nodeIntersections: 0, sharedSegmentCount: 0, crossingCount: 0, unavoidableCrossings: []
    });
    for (const connection of a.connections) {
      for (let i = 1; i < connection.waypoints.length; i++) {
        const p = connection.waypoints[i - 1], q = connection.waypoints[i];
        expect(p.x === q.x || p.y === q.y).toBe(true);
      }
    }
  });

  it('moves a crossing to a free lane when geometry allows it', () => {
    const nodes = [node('left', 0, 130), node('right', 320, 130),
      node('top', 150, 0), node('bottom', 150, 300)];
    const connections = [{ id: 'horizontal', source: 'left', target: 'right' },
      { id: 'vertical', source: 'top', target: 'bottom' }];
    const result = routeViewConnections({ nodes, connections });
    expect(result.metrics.nodeIntersections).toBe(0);
    expect(result.metrics.sharedSegmentCount).toBe(0);
    expect(result.metrics.unavoidableCrossings).toHaveLength(result.metrics.crossingCount);
  });

  it('renders the calculated route as the unchanged SVG path geometry', () => {
    const routed = routeViewConnections({ nodes: [node('a', 0, 0), node('b', 300, 0)],
      connections: [{ id: 'link', source: 'a', target: 'b' }] });
    const renderer = new ArchimateRenderer({}, { on() {} },
      { computeStyle: (attrs) => attrs }, {}, {}, {});
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const waypoints = routed.connections[0].waypoints;
    const line = renderer.drawConnection(layer, { type: 'Line', style: { lineColor: '#333' }, waypoints });
    expect(line.getAttribute('d')).toBe(`M${waypoints[0].x},${waypoints[0].y}L${waypoints[1].x},${waypoints[1].y}`);
    const svg = createSvg({ bbox: { x: 0, y: 0, width: 400, height: 80 }, contents: layer.innerHTML });
    expect(svg).toContain(`d="${line.getAttribute('d')}"`);
  });

  it('routes a self-relationship outside its symbol', () => {
    const result = routeViewConnections({ nodes: [node('loop', 10, 10)],
      connections: [{ id: 'self', source: 'loop', target: 'loop' }] });
    expect(result.connections[0].waypoints[0].x).toBe(100);
    expect(result.connections[0].waypoints.at(-1).y).toBe(70);
    expect(result.metrics.nodeIntersections).toBe(0);
  });
});

describe('view optimization and undo (SYNTHETIC)', () => {
  it('reduces an authored crossing in the selected view', () => {
    const [a, b, c, d] = [node('a', 0, 100, 60, 40), node('b', 300, 100, 60, 40),
      node('c', 150, 0, 60, 40), node('d', 150, 250, 60, 40)];
    const view = { id: 'crossed', viewElements: [a, b, c, d,
      edge('horizontal', a, b, 'Flow', [{ x: 60, y: 120 }, { x: 300, y: 120 }]),
      edge('vertical', c, d, 'Serving', [{ x: 180, y: 40 }, { x: 180, y: 250 }])
    ] };
    const result = optimizeDiagram(view);
    expect(result.metrics.crossingsBefore).toBe(1);
    expect(result.metrics.crossingsAfter).toBe(0);
    expect(result.metrics.overlapCountAfter).toBe(0);
  });

  it('repositions grouped crowded nodes, routes typed edges, and restores exact authored geometry', () => {
    const group = node('group', 0, 0, 130, 100, {
      label: 'A group', meffGeometry: { x: 0, y: 0, w: 130, h: 100, coordinateSpace: 'diagram' },
      nodes: [node('child-a', 12, 12, 90, 60, { style: { lineColor: 'blue' } }), node('child-b', 15, 15)]
    });
    const peer = node('peer', 25, 12);
    const other = node('other', 26, 11);
    const connections = [
      edge('serves', group.nodes[0], peer, 'Serving', [{ x: 1, y: 2, kind: 'sourceAttachment' }, { x: 3, y: 4, kind: 'targetAttachment' }]),
      edge('flows', peer, other, 'Flow'),
      edge('accesses', group.nodes[1], other, 'Access')
    ];
    const view = { id: 'crowded-view', name: 'Synthetic crowded view', viewElements: [group, peer, other, ...connections] };
    const before = JSON.stringify(view, (key, value) => key === 'source' || key === 'target' ? value.id : value);
    const result = optimizeDiagram(view);
    expect(result.metrics.movedNodeCount).toBeGreaterThan(0);
    expect(result.metrics.reroutedConnectionCount).toBe(3);
    expect(result.metrics.overlapCountAfter).toBe(0);
    expect(result.metrics.overlapCountBefore).toBeGreaterThan(0);
    expect(result.metrics.boundsAfter.width).toBeGreaterThan(result.metrics.boundsBefore.width);
    const [optimizedGroup, optimizedPeer, optimizedOther, ...optimizedEdges] = result.view.viewElements;
    for (const child of optimizedGroup.nodes) {
      expect(child.x).toBeGreaterThanOrEqual(optimizedGroup.x);
      expect(child.y).toBeGreaterThanOrEqual(optimizedGroup.y);
      expect(child.x + child.w).toBeLessThanOrEqual(optimizedGroup.x + optimizedGroup.w);
      expect(child.y + child.h).toBeLessThanOrEqual(optimizedGroup.y + optimizedGroup.h);
    }
    expect(optimizedGroup.meffGeometry).toBe(group.meffGeometry);
    expect(optimizedGroup.label).toBe('A group');
    expect(optimizedGroup.nodes[0].style).toBe(group.nodes[0].style);
    expect(optimizedEdges.map((connection) => connection.relationshipRef))
      .toEqual(connections.map((connection) => connection.relationshipRef));
    expect(optimizedEdges[0].source).toBe(optimizedGroup.nodes[0]);
    expect(optimizedEdges[0].target).toBe(optimizedPeer);
    expect(optimizedEdges[1].target).toBe(optimizedOther);
    expect(applyLayoutPatch(result.view, result.patch, 'before').viewElements[3].waypointsNode.waypoints)
      .toEqual(connections[0].waypointsNode.waypoints);
    const restored = applyLayoutPatch(result.view, result.patch, 'before');
    expect(restored.viewElements[0].nodes.map(({ x, y, w, h }) => ({ x, y, w, h })))
      .toEqual(group.nodes.map(({ x, y, w, h }) => ({ x, y, w, h })));
    expect(restored.viewElements.slice(0, 3).map(({ x, y, w, h }) => ({ x, y, w, h })))
      .toEqual(view.viewElements.slice(0, 3).map(({ x, y, w, h }) => ({ x, y, w, h })));
    expect(applyLayoutPatch(view, result.patch, 'after').viewElements[3].waypointsNode.waypoints)
      .toEqual(result.view.viewElements[3].waypointsNode.waypoints);
    expect(JSON.stringify(view, (key, value) => key === 'source' || key === 'target' ? value.id : value)).toBe(before);
    expect(optimizeDiagram(view).patch).toEqual(result.patch);
    expect(() => applyLayoutPatch({ ...view, id: 'another-view' }, result.patch)).toThrow('different view');
  });

  it('applies and reverts the entire modeler change as one command', () => {
    const changed = [];
    const handler = new OptimizeDiagramHandler({ fire(type, payload) { changed.push([type, payload.element.id]); } });
    const nodeObject = { x: 10, y: 20, w: 80, h: 40 };
    const shapeLabel = { id: 'a_label', x: 7, y: 8 };
    const shape = { id: 'a', x: 5, y: 6, width: 80, height: 40, businessObject: nodeObject, label: shapeLabel };
    const authored = [{ x: 1, y: 2, kind: 'sourceAttachment' }, { x: 3, y: 4, kind: 'targetAttachment' }];
    const connectionObject = { waypointsNode: { waypoints: authored } };
    const linkLabel = { id: 'c_label', x: 10, y: 11 };
    const link = { id: 'c', waypoints: authored, businessObject: connectionObject, label: linkLabel };
    const context = {
      nodes: [{ element: shape, elementBefore: { x: 5, y: 6 }, labelBefore: { x: 7, y: 8 },
        before: { x: 10, y: 20, w: 80, h: 40 }, after: { x: 50, y: 70, w: 100, h: 60 } }],
      connections: [{ element: link, labelBefore: { x: 10, y: 11 }, before: authored,
        after: [{ x: 20, y: 30 }, { x: 70, y: 30 }] }]
    };
    handler.execute(context);
    expect(shape).toMatchObject({ x: 45, y: 56, width: 100, height: 60 });
    expect(nodeObject).toEqual({ x: 50, y: 70, w: 100, h: 60 });
    expect(shapeLabel).toMatchObject({ x: 47, y: 58 });
    expect(link.waypoints).toEqual(context.connections[0].after);
    expect(linkLabel).toMatchObject({ x: 53, y: 38 });
    handler.revert(context);
    expect(shape).toMatchObject({ x: 5, y: 6, width: 80, height: 40 });
    expect(connectionObject.waypointsNode.waypoints).toEqual(authored);
    expect(shapeLabel).toMatchObject({ x: 7, y: 8 });
    expect(linkLabel).toMatchObject({ x: 10, y: 11 });
    expect(changed).toEqual([
      ['element.changed', 'a'], ['element.changed', 'a_label'],
      ['element.changed', 'c'], ['element.changed', 'c_label'],
      ['element.changed', 'a'], ['element.changed', 'a_label'],
      ['element.changed', 'c'], ['element.changed', 'c_label']
    ]);
  });

  it('wires the Modeler API through the registered command and supports redo', () => {
    const first = node('a', 0, 0), second = node('b', 15, 5);
    const link = edge('link', first, second);
    const view = { id: 'modeler-view', viewElements: [first, second, link] };
    const elements = new Map(view.viewElements.map((businessObject) => [businessObject.id,
      businessObject.waypointsNode
        ? { id: businessObject.id, waypoints: [], businessObject }
        : { id: businessObject.id, x: businessObject.x, y: businessObject.y,
          width: businessObject.w, height: businessObject.h, businessObject }
    ]));
    const registered = Modeling.prototype.getHandlers()['diagram.optimize'];
    expect(registered).toBe(OptimizeDiagramHandler);
    const handler = new registered({ fire() {} });
    let commandCount = 0, saved;
    const stack = {
      execute(name, context) {
        expect(name).toBe('diagram.optimize');
        commandCount++;
        saved = context;
        handler.execute(context);
      },
      undo() { handler.revert(saved); },
      redo() { handler.execute(saved); }
    };
    const modeler = { get(name) {
      return { canvas: { getRootElement: () => ({ businessObject: view }) },
        elementRegistry: { get: (id) => elements.get(id) }, commandStack: stack }[name];
    } };
    const result = Modeler.prototype.optimizeDiagram.call(modeler);
    expect(commandCount).toBe(1);
    expect(result.metrics.movedNodeCount).toBeGreaterThan(0);
    expect(elements.get('b').x).toBe(result.patch.nodes.find((entry) => entry.id === 'b').after.x);
    stack.undo();
    expect(first.x).toBe(0);
    expect(second.y).toBe(5);
    expect(link.waypointsNode.waypoints).toEqual([]);
    stack.redo();
    expect(link.waypointsNode.waypoints).toEqual(result.patch.connections[0].after);
    expect(elements.get('b').x).toBe(result.patch.nodes.find((entry) => entry.id === 'b').after.x);
  });

});
