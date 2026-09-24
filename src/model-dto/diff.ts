import type { ModelDto, ViewNodeDto } from './types.js';
import { validateModelDto } from './validate.js';

export type ModelDiffArea = 'semantic' | 'presentation';
export type ModelDiffKind = 'added' | 'removed' | 'modified';
export type ModelDiffEntity = 'model' | 'element' | 'relationship' | 'view' | 'node' | 'connection';

export interface ModelDiffChange {
  area: ModelDiffArea;
  entity: ModelDiffEntity;
  kind: ModelDiffKind;
  id: string;
  viewId?: string;
  changedFields: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface ModelDtoDiff {
  schemaVersion: 1;
  changes: ModelDiffChange[];
  impactedViewIds: string[];
}

type DiffRecord = Record<string, unknown> & { id: string };
type NodeRecord = DiffRecord & { viewId: string; parentId?: string };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) =>
      item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) =>
      [key, canonical(item)]));
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function eligible(input: unknown): ModelDto {
  const model = validateModelDto(input);
  if (model.diagnostics.length || stable(input) !== stable(model)) {
    const error = new TypeError('The model DTO cannot be compared without loss.');
    Object.assign(error, { code: 'MODEL_DTO_DIFF_INELIGIBLE' });
    throw error;
  }
  return model;
}

function record(value: object): DiffRecord {
  return value as DiffRecord;
}

function compareRecords(
  area: ModelDiffArea, entity: ModelDiffEntity, before: DiffRecord[],
  after: DiffRecord[], changes: ModelDiffChange[], viewId?: string
): void {
  const old = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  const ids = [...new Set([...old.keys(), ...next.keys()])].sort();
  for (const id of ids) {
    const previous = old.get(id);
    const current = next.get(id);
    const fields = [...new Set([
      ...Object.keys(previous ?? {}), ...Object.keys(current ?? {})
    ])].filter((field) => field !== 'id' && field !== 'viewId' &&
      stable(previous?.[field]) !== stable(current?.[field])).sort();
    if (previous && current && !fields.length) continue;
    const change: ModelDiffChange = {
      area, entity, kind: !previous ? 'added' : !current ? 'removed' : 'modified',
      id, changedFields: fields
    };
    if (viewId) change.viewId = viewId;
    if (previous) change.before = canonical(previous) as Record<string, unknown>;
    if (current) change.after = canonical(current) as Record<string, unknown>;
    changes.push(change);
  }
}

function flattenNodes(nodes: ViewNodeDto[], viewId: string, parentId?: string): NodeRecord[] {
  const result: NodeRecord[] = [];
  for (const { nodes: children, ...node } of nodes) {
    result.push({ ...node, viewId, parentId });
    result.push(...flattenNodes(children, viewId, node.id));
  }
  return result;
}

function viewsForConcept(model: ModelDto, id: string, entity: ModelDiffEntity): string[] {
  return model.views.filter((view) => entity === 'element'
    ? flattenNodes(view.nodes, view.id).some((node) => node.elementId === id)
    : view.connections.some((edge) => edge.relationshipId === id)).map((view) => view.id);
}

function impactedViews(
  changes: ModelDiffChange[], before: ModelDto, after: ModelDto
): string[] {
  const ids = new Set<string>();
  for (const change of changes) {
    if (change.viewId) ids.add(change.viewId);
    if (change.entity === 'view') ids.add(change.id);
    if (change.area === 'semantic' && change.entity !== 'model') {
      for (const model of [before, after]) {
        viewsForConcept(model, change.id, change.entity).forEach((id) => ids.add(id));
      }
    }
  }
  return [...ids].sort();
}

/** Compare the lossless supported DTO subset by stable IDs; never mutates inputs. */
export function diffModelDto(beforeInput: unknown, afterInput: unknown): ModelDtoDiff {
  const before = eligible(beforeInput);
  const after = eligible(afterInput);
  const changes: ModelDiffChange[] = [];
  compareRecords('semantic', 'model', [record({ id: before.id, name: before.name })],
    [record({ id: after.id, name: after.name })], changes);
  compareRecords('semantic', 'element', before.elements.map(record),
    after.elements.map(record), changes);
  compareRecords('semantic', 'relationship', before.relationships.map(record),
    after.relationships.map(record), changes);
  const oldViews = new Map(before.views.map((view) => [view.id, view]));
  const newViews = new Map(after.views.map((view) => [view.id, view]));
  compareRecords('presentation', 'view', before.views.map((view) =>
    record({ id: view.id, name: view.name })), after.views.map((view) =>
    record({ id: view.id, name: view.name })), changes);
  for (const viewId of [...new Set([...oldViews.keys(), ...newViews.keys()])].sort()) {
    const old = oldViews.get(viewId);
    const next = newViews.get(viewId);
    compareRecords('presentation', 'node',
      flattenNodes(old?.nodes ?? [], viewId),
      flattenNodes(next?.nodes ?? [], viewId), changes, viewId);
    compareRecords('presentation', 'connection',
      (old?.connections ?? []).map(record), (next?.connections ?? []).map(record),
      changes, viewId);
  }
  changes.sort((a, b) => stable([a.area, a.entity, a.viewId ?? '', a.id]).localeCompare(
    stable([b.area, b.entity, b.viewId ?? '', b.id])));
  return { schemaVersion: 1, changes, impactedViewIds: impactedViews(changes, before, after) };
}
