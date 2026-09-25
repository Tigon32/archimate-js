import type { ModelDiffChange } from './diff.js';
import { diffModelDto } from './diff.js';
import type { ModelDto, ViewConnectionDto, ViewNodeDto } from './types.js';
import { validateModelDto } from './validate.js';

type ChangeKind = ModelDiffChange['kind'];
type Entity = 'node' | 'connection';
type Rect = { kind: 'node'; x: number; y: number; width: number; height: number };
type Route = { kind: 'connection'; points: Array<{ x: number; y: number }> };
type Geometry = Rect | Route;
type OverlayMark = { key: string; entity: Entity; kind: ChangeKind;
  before?: Geometry; after?: Geometry };

function flattenNodes(nodes: ViewNodeDto[], result: ViewNodeDto[] = []): ViewNodeDto[] {
  for (const node of nodes) {
    result.push(node);
    flattenNodes(node.nodes, result);
  }
  return result;
}

function nodeGeometry(node: ViewNodeDto): Rect {
  return { kind: 'node', x: node.x, y: node.y, width: node.width, height: node.height };
}

function connectionGeometry(connection: ViewConnectionDto): Route {
  return { kind: 'connection', points: connection.waypoints.map(({ x, y }) => ({ x, y })) };
}

function recordRect(record: Record<string, unknown> | undefined): Rect | undefined {
  if (!record || !['x', 'y', 'width', 'height'].every((key) =>
    typeof record[key] === 'number')) return undefined;
  const { x, y, width, height } = record as Record<'x' | 'y' | 'width' | 'height', number>;
  return { kind: 'node', x, y, width, height };
}

function recordRoute(record: Record<string, unknown> | undefined): Route | undefined {
  const waypoints = record?.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length < 2 || !waypoints.every((point) =>
    Boolean(point && typeof point === 'object' && 'x' in point && 'y' in point &&
      typeof point.x === 'number' && typeof point.y === 'number'))) return undefined;
  return { kind: 'connection', points: waypoints.map((point) => {
    const { x, y } = point as { x: number; y: number };
    return { x, y };
  }) };
}

function sameGeometry(left?: Geometry, right?: Geometry): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addMark(marks: Map<string, OverlayMark>, mark: OverlayMark): void {
  marks.set(`${mark.entity}:${mark.key}`, mark);
}

function markedIds(marks: Map<string, OverlayMark>, entity: Entity): Set<string> {
  return new Set([...marks.values()].filter((mark) => mark.entity === entity).map((mark) => mark.key));
}

function addPresentationChanges(
  changes: ModelDiffChange[], viewId: string, marks: Map<string, OverlayMark>
): void {
  for (const change of changes) {
    if (change.area !== 'presentation' || change.viewId !== viewId ||
        (change.entity !== 'node' && change.entity !== 'connection')) continue;
    const before = change.entity === 'node' ? recordRect(change.before) : recordRoute(change.before);
    const after = change.entity === 'node' ? recordRect(change.after) : recordRoute(change.after);
    addMark(marks, { key: change.id, entity: change.entity, kind: change.kind, before, after });
  }
}

function nodesForElement(view: ModelDto['views'][number] | undefined, elementId: string): Map<string, Rect> {
  return new Map(flattenNodes(view?.nodes ?? []).filter((node) => node.elementId === elementId)
    .map((node) => [node.id, nodeGeometry(node)]));
}

function connectionsForRelationship(
  view: ModelDto['views'][number] | undefined, relationshipId: string
): Map<string, Route> {
  return new Map((view?.connections ?? []).filter((connection) =>
    connection.relationshipId === relationshipId).map((connection) =>
    [connection.id, connectionGeometry(connection)]));
}

function addSemanticChanges(
  changes: ModelDiffChange[], viewId: string, before: ModelDto, after: ModelDto,
  marks: Map<string, OverlayMark>
): void {
  const beforeView = before.views.find((view) => view.id === viewId);
  const afterView = after.views.find((view) => view.id === viewId);
  for (const change of changes) {
    if (change.area !== 'semantic' ||
        (change.entity !== 'element' && change.entity !== 'relationship')) continue;
    const oldItems = change.entity === 'element'
      ? nodesForElement(beforeView, change.id) : connectionsForRelationship(beforeView, change.id);
    const newItems = change.entity === 'element'
      ? nodesForElement(afterView, change.id) : connectionsForRelationship(afterView, change.id);
    const entity: Entity = change.entity === 'element' ? 'node' : 'connection';
    const existing = markedIds(marks, entity);
    for (const key of [...new Set([...oldItems.keys(), ...newItems.keys()])].sort()) {
      if (existing.has(key)) continue;
      addMark(marks, { key, entity, kind: change.kind,
        before: oldItems.get(key), after: newItems.get(key) });
    }
  }
}

function viewBoxFor(views: Array<ModelDto['views'][number] | undefined>): [number, number, number, number] {
  const points: Array<{ x: number; y: number }> = [];
  for (const view of views) {
    for (const node of flattenNodes(view?.nodes ?? [])) {
      points.push({ x: node.x, y: node.y }, { x: node.x + node.width, y: node.y + node.height });
    }
    for (const connection of view?.connections ?? []) points.push(...connection.waypoints);
  }
  if (!points.length) return [0, 0, 1, 1];
  const padding = 12;
  const left = Math.min(...points.map(({ x }) => x)) - padding;
  const top = Math.min(...points.map(({ y }) => y)) - padding;
  const right = Math.max(...points.map(({ x }) => x)) + padding;
  const bottom = Math.max(...points.map(({ y }) => y)) + padding;
  return [left, top, Math.max(1, right - left), Math.max(1, bottom - top)];
}

function numberText(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError('SVG geometry must be finite.');
  return String(Object.is(value, -0) ? 0 : value);
}

function stateSuffix(mark: OverlayMark, geometry: Geometry): string {
  if (mark.kind !== 'modified' || !mark.before || !mark.after ||
      sameGeometry(mark.before, mark.after)) return '';
  return geometry === mark.before ? ' archimate-diff-before' : ' archimate-diff-after';
}

function accessibleName(mark: OverlayMark, geometry: Geometry): string {
  const state = stateSuffix(mark, geometry).trim().replace('archimate-diff-', '');
  return `${mark.kind} diagram ${mark.entity}${state ? ` ${state}` : ''}`;
}

function renderGeometry(mark: OverlayMark, geometry: Geometry): string {
  const classes = `archimate-diff-shape archimate-diff-${mark.kind}${stateSuffix(mark, geometry)}`;
  const name = accessibleName(mark, geometry);
  if (geometry.kind === 'node') {
    return `<rect class="${classes}" role="graphics-object group" aria-label="${name}" x="${numberText(geometry.x)}" y="${numberText(geometry.y)}" width="${numberText(geometry.width)}" height="${numberText(geometry.height)}"/>`;
  }
  const [first, ...rest] = geometry.points;
  const path = `M ${numberText(first.x)} ${numberText(first.y)} ${rest.map((point) =>
    `L ${numberText(point.x)} ${numberText(point.y)}`).join(' ')}`;
  return `<path class="${classes}" role="graphics-object group" aria-label="${name}" d="${path}"/>`;
}

function geometryForMark(mark: OverlayMark): Geometry[] {
  if (mark.kind === 'removed') return mark.before ? [mark.before] : [];
  if (mark.kind === 'added') return mark.after ? [mark.after] : [];
  if (mark.before && mark.after && !sameGeometry(mark.before, mark.after)) {
    return [mark.before, mark.after];
  }
  return mark.after ? [mark.after] : mark.before ? [mark.before] : [];
}

function overlaySvg(
  marks: OverlayMark[], bounds: [number, number, number, number]
): string {
  const counts = { added: 0, removed: 0, modified: 0 };
  for (const mark of marks) counts[mark.kind]++;
  const shapes = marks.flatMap((mark) => geometryForMark(mark).map((geometry) =>
    renderGeometry(mark, geometry))).join('');
  const [x, y, width, height] = bounds.map(numberText);
  const description = `Added ${counts.added}; removed ${counts.removed}; modified ${counts.modified}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="graphics-document document" aria-labelledby="archimate-diff-title" aria-describedby="archimate-diff-description" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}"><title id="archimate-diff-title">Diagram change overlay</title><desc id="archimate-diff-description">${description}</desc><style>.archimate-diff-shape{fill:none;stroke-width:3;vector-effect:non-scaling-stroke}.archimate-diff-added{stroke:#137333}.archimate-diff-removed{stroke:#b3261e;stroke-dasharray:6 4}.archimate-diff-modified{stroke:#8a4a00}.archimate-diff-before{stroke-dasharray:6 4;opacity:.65}.archimate-diff-after{stroke-width:4}</style>${shapes}</svg>`;
}

function viewNotFound(): never {
  const error = new TypeError('The requested view is not present in either DTO.');
  Object.assign(error, { code: 'MODEL_DTO_DIFF_VIEW_NOT_FOUND' });
  throw error;
}

/** Render a content-free SVG geometry layer for one view's DTO changes. */
export function renderModelDtoDiffOverlay(beforeInput: unknown, afterInput: unknown,
  viewId: string): string {
  const diff = diffModelDto(beforeInput, afterInput);
  const before = validateModelDto(beforeInput);
  const after = validateModelDto(afterInput);
  const beforeView = before.views.find((view) => view.id === viewId);
  const afterView = after.views.find((view) => view.id === viewId);
  if (!beforeView && !afterView) viewNotFound();
  const marks = new Map<string, OverlayMark>();
  addPresentationChanges(diff.changes, viewId, marks);
  addSemanticChanges(diff.changes, viewId, before, after, marks);
  const ordered = [...marks.values()].sort((left, right) =>
    left.entity === right.entity ? left.key < right.key ? -1 : left.key > right.key ? 1 : 0 :
      left.entity < right.entity ? -1 : 1);
  return overlaySvg(ordered, viewBoxFor([beforeView, afterView]));
}
