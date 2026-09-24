// SYNTHETIC geometry only: routing never reads or changes ArchiMate semantics.
const EPS = 1e-7;
const point = (x, y) => ({ x, y });
const clone = (value) => value.map(({ x, y }) => point(x, y));

function finiteBox(node) {
  if (!node || typeof node.id !== 'string' || ![node.x, node.y, node.w, node.h].every(Number.isFinite) ||
      node.w <= 0 || node.h <= 0) throw new TypeError('Nodes require an id and finite positive diagram-space bounds');
  return { id: node.id, x: node.x, y: node.y, w: node.w, h: node.h };
}

function segments(route) {
  return route.slice(1).map((end, i) => [route[i], end]);
}

function openInterior(a, b, box) {
  if (a.x === b.x) return a.x > box.x + EPS && a.x < box.x + box.w - EPS &&
    Math.max(a.y, b.y) > box.y + EPS && Math.min(a.y, b.y) < box.y + box.h - EPS;
  return a.y > box.y + EPS && a.y < box.y + box.h - EPS &&
    Math.max(a.x, b.x) > box.x + EPS && Math.min(a.x, b.x) < box.x + box.w - EPS;
}

function overlap(a, b, c, d) {
  if (a.x === b.x && c.x === d.x && a.x === c.x) {
    return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) > EPS;
  }
  if (a.y === b.y && c.y === d.y && a.y === c.y) {
    return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
      Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > EPS;
  }
  return false;
}

function crossing(a, b, c, d) {
  if (a.x === b.x && c.y === d.y) return c.y > Math.min(a.y, b.y) + EPS &&
    c.y < Math.max(a.y, b.y) - EPS && a.x > Math.min(c.x, d.x) + EPS && a.x < Math.max(c.x, d.x) - EPS;
  if (a.y === b.y && c.x === d.x) return crossing(c, d, a, b);
  return false;
}

function relationshipCost(a, b, routes) {
  let shared = 0;
  let crossings = 0;
  for (const route of routes) for (const [c, d] of segments(route)) {
    if (overlap(a, b, c, d)) shared++;
    if (crossing(a, b, c, d)) crossings++;
  }
  return { shared, crossings };
}

function side(source, target) {
  const dx = target.x + target.w / 2 - source.x - source.w / 2;
  const dy = target.y + target.h / 2 - source.y - source.h / 2;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
}

const opposite = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };

function port(box, direction, slot, count, clearance) {
  const horizontal = direction === 'top' || direction === 'bottom';
  const span = horizontal ? box.w : box.h;
  const inset = Math.min(clearance / 2, span / 4);
  const ideal = inset + (span - 2 * inset) * (slot + 1) / (count + 1);
  // Integer diagram bounds produce integer attachment coordinates when there
  // is enough room for distinct integer ports (as required by MEFF export).
  const offset = Number.isInteger(span) && Number.isInteger(inset) &&
    count + 1 <= span - 2 * inset ? Math.round(ideal) : ideal;
  const boundary = horizontal
    ? point(box.x + offset, direction === 'top' ? box.y : box.y + box.h)
    : point(direction === 'left' ? box.x : box.x + box.w, box.y + offset);
  const outside = horizontal
    ? point(boundary.x, boundary.y + (direction === 'top' ? -clearance : clearance))
    : point(boundary.x + (direction === 'left' ? -clearance : clearance), boundary.y);
  return { boundary, outside };
}

class Heap {
  items = [];
  push(value) {
    const a = this.items;
    a.push(value);
    for (let i = a.length - 1; i > 0;) {
      const p = Math.floor((i - 1) / 2);
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const result = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0;;) {
        let child = 2 * i + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && a[child + 1][0] < a[child][0]) child++;
        if (a[i][0] <= a[child][0]) break;
        [a[i], a[child]] = [a[child], a[i]];
        i = child;
      }
    }
    return result;
  }
  get size() { return this.items.length; }
}

function findRoute(start, end, obstacles, routes, clearance, bundle) {
  const xs = new Set([start.x, end.x]);
  const ys = new Set([start.y, end.y]);
  for (const box of obstacles) {
    [box.x - clearance, box.x, box.x + box.w, box.x + box.w + clearance].forEach((x) => xs.add(x));
    [box.y - clearance, box.y, box.y + box.h, box.y + box.h + clearance].forEach((y) => ys.add(y));
  }
  for (const route of routes) for (const p of route) {
    [p.x - clearance / 3, p.x, p.x + clearance / 3].forEach((x) => xs.add(x));
    [p.y - clearance / 3, p.y, p.y + clearance / 3].forEach((y) => ys.add(y));
  }
  const xList = [...xs].sort((a, b) => a - b);
  const yList = [...ys].sort((a, b) => a - b);
  if (xList.length * yList.length > 200000) throw new RangeError('Routing grid exceeds supported size');
  const height = yList.length;
  const index = (x, y) => x * height + y;
  const ix = xList.indexOf(start.x), iy = yList.indexOf(start.y);
  const ex = xList.indexOf(end.x), ey = yList.indexOf(end.y);
  const dist = new Map();
  const previous = new Map();
  const heap = new Heap();
  let sequence = 0;
  const first = index(ix, iy) * 3;
  dist.set(first, 0);
  heap.push([0, sequence++, ix, iy, 0]);
  let finish;
  while (heap.size) {
    const [cost, , x, y, axis] = heap.pop();
    const state = index(x, y) * 3 + axis;
    if (cost !== dist.get(state)) continue;
    if (x === ex && y === ey) { finish = state; break; }
    for (const [nx, ny, nextAxis] of [[x - 1, y, 1], [x + 1, y, 1], [x, y - 1, 2], [x, y + 1, 2]]) {
      if (nx < 0 || nx >= xList.length || ny < 0 || ny >= height) continue;
      const a = point(xList[x], yList[y]), b = point(xList[nx], yList[ny]);
      if (obstacles.some((box) => openInterior(a, b, box))) continue;
      const { shared, crossings } = relationshipCost(a, b, routes);
      if (shared && !bundle) continue;
      const next = index(nx, ny) * 3 + nextAxis;
      const weight = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) +
        (axis && axis !== nextAxis ? clearance * 2 : 0) +
        crossings * clearance * 1000 + shared * clearance * 1000 +
        // Small deterministic lane penalty avoids hugging an unrelated boundary.
        obstacles.reduce((total, box) => total +
          ((a.x === b.x && (a.x === box.x || a.x === box.x + box.w)) ||
           (a.y === b.y && (a.y === box.y || a.y === box.y + box.h)) ? 0.001 : 0), 0);
      if (cost + weight + EPS < (dist.get(next) ?? Infinity)) {
        dist.set(next, cost + weight);
        previous.set(next, state);
        heap.push([cost + weight, sequence++, nx, ny, nextAxis]);
      }
    }
  }
  if (finish === undefined) throw new Error('No non-overlapping orthogonal route exists for this geometry');
  const reverse = [];
  for (let current = finish; current !== undefined; current = previous.get(current)) {
    const vertex = Math.floor(current / 3);
    reverse.push(point(xList[Math.floor(vertex / height)], yList[vertex % height]));
  }
  const path = reverse.reverse();
  return path.filter((p, i) => i === 0 || i === path.length - 1 ||
    (path[i - 1].x !== path[i + 1].x && path[i - 1].y !== path[i + 1].y));
}

/** Route diagram-space nodes and connections without changing the inputs. */
export function routeViewConnections({ nodes, connections, clearance = 12, bundle = false } = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(connections) || !Number.isFinite(clearance) || clearance <= 0) {
    throw new TypeError('Expected nodes, connections and positive clearance');
  }
  const boxes = new Map(nodes.map((node) => { const box = finiteBox(node); return [box.id, box]; }));
  if (boxes.size !== nodes.length) throw new TypeError('Duplicate node id');
  const sorted = [...connections].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const slots = new Map();
  const edges = sorted.map((connection) => {
    const sourceId = typeof connection.source === 'string' ? connection.source : connection.source?.id;
    const targetId = typeof connection.target === 'string' ? connection.target : connection.target?.id;
    const source = boxes.get(sourceId), target = boxes.get(targetId);
    if (!source || !target || typeof connection.id !== 'string') {
      throw new TypeError('Connections require unique ids and source/target node ids');
    }
    const sourceSide = source === target ? 'right' : side(source, target);
    const targetSide = source === target ? 'bottom' : opposite[sourceSide];
    for (const [id, direction] of [[sourceId, sourceSide], [targetId, targetSide]]) {
      const k = `${id}:${direction}`;
      if (!slots.has(k)) slots.set(k, []);
      slots.get(k).push(connection.id);
    }
    return { connection, source, target, sourceSide, targetSide };
  });
  if (new Set(edges.map(({ connection }) => connection.id)).size !== edges.length) throw new TypeError('Duplicate connection id');
  const results = new Map(), occupied = [];
  const unavoidableCrossings = [];
  for (const { connection, source, target, sourceSide, targetSide } of edges) {
    const locate = (box, direction) => {
      const group = slots.get(`${box.id}:${direction}`);
      return port(box, direction, group.indexOf(connection.id), group.length, clearance);
    };
    const start = locate(source, sourceSide), end = locate(target, targetSide);
    const contains = (box, node) => box.x <= node.x && box.y <= node.y &&
      box.x + box.w >= node.x + node.w && box.y + box.h >= node.y + node.h;
    // A containing group encloses the endpoint by design. It is passable at
    // that endpoint; unrelated nodes, including unrelated groups, are not.
    const obstacles = [...boxes.values()].filter((box) =>
      box.id === source.id || box.id === target.id || !contains(box, source) && !contains(box, target));
    const transit = findRoute(start.outside, end.outside, obstacles, occupied, clearance, bundle);
    const full = [start.boundary, ...transit, end.boundary];
    const simplified = full.filter((p, i) => i === 0 || i === full.length - 1 ||
      (full[i - 1].x !== full[i + 1].x && full[i - 1].y !== full[i + 1].y));
    const crossings = occupied.flatMap((route) => segments(simplified).flatMap(([a, b]) =>
      segments(route).filter(([c, d]) => crossing(a, b, c, d)).map(([c, d]) =>
        point(a.x === b.x ? a.x : c.x, a.y === b.y ? a.y : c.y))));
    for (const at of crossings) unavoidableCrossings.push({ connectionId: connection.id, at });
    occupied.push(simplified);
    results.set(connection.id, { ...connection, waypoints: clone(simplified) });
  }
  const routed = connections.map((connection) => results.get(connection.id));
  const all = routed.map(({ waypoints }) => waypoints);
  let sharedSegmentCount = 0, crossingCount = 0, nodeIntersections = 0;
  for (let i = 0; i < all.length; i++) {
    for (const [a, b] of segments(all[i])) {
      const sourceId = typeof connections[i].source === 'string' ? connections[i].source : connections[i].source.id;
      const targetId = typeof connections[i].target === 'string' ? connections[i].target : connections[i].target.id;
      const source = boxes.get(sourceId), target = boxes.get(targetId);
      const contains = (box, node) => box.x <= node.x && box.y <= node.y &&
        box.x + box.w >= node.x + node.w && box.y + box.h >= node.y + node.h;
      nodeIntersections += [...boxes.values()].filter((box) =>
        box.id !== sourceId && box.id !== targetId && !contains(box, source) && !contains(box, target) &&
        openInterior(a, b, box)).length;
      for (let j = 0; j < i; j++) for (const [c, d] of segments(all[j])) {
        if (overlap(a, b, c, d)) sharedSegmentCount++;
        if (crossing(a, b, c, d)) crossingCount++;
      }
    }
  }
  return { connections: routed, metrics: { nodeIntersections, sharedSegmentCount, crossingCount, unavoidableCrossings } };
}

export function countCrossings(connections) {
  let count = 0;
  for (let i = 0; i < connections.length; i++) for (let j = 0; j < i; j++) {
    const a = connections[i].waypoints || connections[i].waypointsNode?.waypoints || [];
    const b = connections[j].waypoints || connections[j].waypointsNode?.waypoints || [];
    for (const [p, q] of segments(a)) for (const [r, s] of segments(b)) if (crossing(p, q, r, s)) count++;
  }
  return count;
}
