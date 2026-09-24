import { countCrossings, routeViewConnections } from './route-view-connections.mjs';

const copyPoints = (points) => points?.map((point) => ({ ...point }));
const geometry = (node) => ({ x: node.x, y: node.y, w: node.w, h: node.h });

function allNodes(view) {
  const result = [];
  function visit(node) {
    result.push(node);
    for (const child of node.nodes || []) visit(child);
  }
  for (const item of view.viewElements || []) if (item.$type !== 'archimate:Connection' && item.w !== undefined) visit(item);
  return result;
}

function allConnections(view) {
  return (view.viewElements || []).filter((item) => item.$type === 'archimate:Connection' || item.waypointsNode);
}

function bounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  return {
    x, y,
    width: Math.max(...nodes.map((node) => node.x + node.w)) - x,
    height: Math.max(...nodes.map((node) => node.y + node.h)) - y
  };
}

function overlapCount(nodes) {
  let count = 0;
  for (let i = 0; i < nodes.length; i++) for (let j = 0; j < i; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) count++;
  }
  return count;
}

function siblingOverlaps(view) {
  function count(nodes) {
    return overlapCount(nodes) + nodes.reduce((total, node) => total + count(node.nodes || []), 0);
  }
  return count((view.viewElements || []).filter((item) => item.w !== undefined));
}

function cloneView(view) {
  const nodeMap = new Map();
  function cloneNode(node) {
    const cloned = { ...node, nodes: (node.nodes || []).map(cloneNode) };
    nodeMap.set(node.id, cloned);
    return cloned;
  }
  return {
    ...view,
    viewElements: (view.viewElements || []).map((item) => item.$type === 'archimate:Connection' || item.waypointsNode
      ? { ...item, waypointsNode: { ...item.waypointsNode, waypoints: copyPoints(item.waypointsNode?.waypoints) || [] } }
      : cloneNode(item))
  };
}

function descendantOf(node, parent) {
  if (node === parent) return true;
  return (parent.nodes || []).some((child) => descendantOf(node, child));
}

function siblingFor(endpoint, siblings) {
  return siblings.find((node) => descendantOf(endpoint, node));
}

function placeSiblings(siblings, connections, left, top, spacing) {
  if (!siblings.length) return { width: 0, height: 0 };
  const ranks = new Map(siblings.map((node) => [node.id, 0]));
  const edges = connections.map((connection) => {
    const source = siblingFor(connection.source, siblings);
    const target = siblingFor(connection.target, siblings);
    return source && target && source !== target ? [source.id, target.id] : null;
  }).filter(Boolean).sort((a, b) => a.join(':').localeCompare(b.join(':')));
  // Iterative relaxation with a cycle guard: cyclic edges retain stable ranks.
  for (let round = 0; round < siblings.length; round++) {
    let changed = false;
    for (const [source, target] of edges) {
      if (ranks.get(target) <= ranks.get(source) && ranks.get(source) < siblings.length - 1) {
        ranks.set(target, ranks.get(source) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const layers = new Map();
  for (const node of [...siblings].sort((a, b) => a.id.localeCompare(b.id))) {
    const rank = ranks.get(node.id);
    if (!layers.has(rank)) layers.set(rank, []);
    layers.get(rank).push(node);
  }
  let x = left, totalHeight = 0;
  for (const rank of [...layers.keys()].sort((a, b) => a - b)) {
    const layer = layers.get(rank);
    let y = top;
    for (const node of layer) {
      const dx = x - node.x, dy = y - node.y;
      moveTree(node, dx, dy);
      y += node.h + spacing;
    }
    totalHeight = Math.max(totalHeight, y - top - spacing);
    x += Math.max(...layer.map((node) => node.w)) + spacing;
  }
  return { width: x - left - spacing, height: totalHeight };
}

function moveTree(node, dx, dy) {
  node.x += dx;
  node.y += dy;
  for (const child of node.nodes || []) moveTree(child, dx, dy);
}

function optimizeGroups(nodes, connections, spacing, padding) {
  for (const node of nodes) {
    if (!(node.nodes || []).length) continue;
    optimizeGroups(node.nodes, connections, spacing, padding);
    const dimensions = placeSiblings(node.nodes, connections, node.x + padding, node.y + padding, spacing);
    node.w = Math.max(node.w, dimensions.width + 2 * padding);
    node.h = Math.max(node.h, dimensions.height + 2 * padding);
  }
}

/**
 * Optimize one view's presentation geometry. The original remains untouched;
 * the reversible patch contains both old and new geometry. Semantic references,
 * labels, styles and the imported meffGeometry source snapshot are retained.
 */
export function optimizeDiagram(view, { spacing = 40, padding = 24, routeConnections = true,
  clearance = 12 } = {}) {
  if (!view || !Array.isArray(view.viewElements) || !Number.isFinite(spacing) || spacing <= 0 ||
      !Number.isFinite(padding) || padding < 0) throw new TypeError('Expected a view and positive layout spacing');
  const optimized = cloneView(view);
  const originalNodes = allNodes(view), nodes = allNodes(optimized);
  const originalConnections = allConnections(view), connections = allConnections(optimized);
  const source = new Map(nodes.map((node) => [node.id, node]));
  if (source.size !== nodes.length || new Set(connections.map((connection) => connection.id)).size !== connections.length) {
    throw new TypeError('View objects require unique ids');
  }
  for (const connection of connections) {
    connection.source = source.get(connection.source?.id || connection.source);
    connection.target = source.get(connection.target?.id || connection.target);
    if (!connection.source || !connection.target) throw new TypeError('Connection endpoint is absent from the selected view');
  }
  const original = bounds(originalNodes);
  const topNodes = optimized.viewElements.filter((item) => source.get(item.id) === item);
  optimizeGroups(topNodes, connections, spacing, padding);
  placeSiblings(topNodes, connections, original.x, original.y, spacing);
  if (routeConnections && connections.length) {
    const routed = routeViewConnections({ nodes, connections, clearance });
    for (let i = 0; i < connections.length; i++) {
      connections[i].waypointsNode.waypoints = routed.connections[i].waypoints;
    }
  }
  const nodeChanges = nodes.flatMap((node, i) => {
    const before = geometry(originalNodes[i]), after = geometry(node);
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ id: node.id, before, after }];
  });
  const connectionChanges = connections.flatMap((connection, i) => {
    const before = copyPoints(originalConnections[i].waypointsNode?.waypoints) || [];
    const after = copyPoints(connection.waypointsNode?.waypoints) || [];
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ id: connection.id, before, after }];
  });
  const patch = { viewId: view.id, nodes: nodeChanges, connections: connectionChanges };
  return {
    view: optimized, patch,
    metrics: {
      movedNodeCount: nodeChanges.length,
      reroutedConnectionCount: connectionChanges.length,
      crossingsBefore: countCrossings(originalConnections),
      crossingsAfter: countCrossings(connections),
      overlapCountBefore: siblingOverlaps(view),
      overlapCountAfter: siblingOverlaps(optimized),
      boundsBefore: original,
      boundsAfter: bounds(nodes)
    }
  };
}

/** Apply either side of a patch to a selected view. The input is copied. */
export function applyLayoutPatch(view, patch, direction = 'after') {
  if (direction !== 'before' && direction !== 'after') throw new TypeError('Direction must be before or after');
  if (!patch || patch.viewId !== view?.id) throw new TypeError('Patch belongs to a different view');
  const result = cloneView(view);
  const nodes = new Map(allNodes(result).map((node) => [node.id, node]));
  const connections = new Map(allConnections(result).map((connection) => [connection.id, connection]));
  for (const entry of patch.nodes) {
    const node = nodes.get(entry.id);
    if (!node) throw new TypeError('Patch references an absent node');
    Object.assign(node, entry[direction]);
  }
  for (const entry of patch.connections) {
    const connection = connections.get(entry.id);
    if (!connection) throw new TypeError('Patch references an absent connection');
    connection.waypointsNode.waypoints = copyPoints(entry[direction]);
  }
  for (const connection of connections.values()) {
    connection.source = nodes.get(connection.source?.id || connection.source);
    connection.target = nodes.get(connection.target?.id || connection.target);
  }
  return result;
}
