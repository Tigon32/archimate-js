import type { ElementDto, ModelDto, ViewNodeDto } from './types.js';
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
  renameCandidates?: ModelDtoRenameCandidate[];
  impactedViewIds: string[];
}

/** A review hint only; stable IDs remain authoritative for change classification. */
export interface ModelDtoRenameCandidate {
  beforeId: string;
  afterId: string;
  heuristic: true;
  confidence: number;
  reason: 'unique-content-match-except-id-and-name';
}

export type ModelDtoDiffEligibilityCode =
  | 'MODEL_DTO_DIFF_LOSSY_PROJECTION'
  | 'MODEL_DTO_DIFF_UNSUPPORTED_FIELDS'
  | 'MODEL_DTO_DIFF_NON_CANONICAL_DATA';

/** Content-free reason why one side cannot be compared without loss. */
export interface ModelDtoDiffEligibilityDiagnostic {
  input: 'before' | 'after';
  code: ModelDtoDiffEligibilityCode;
  /** Number of projection diagnostics or unsupported fields; otherwise 1. */
  count: number;
  /** Content-free field paths or construct codes that the supported DTO subset cannot preserve. */
  details: string[];
}

export interface ModelDtoDiffEligibility {
  eligible: boolean;
  diagnostics: ModelDtoDiffEligibilityDiagnostic[];
}

type DiffRecord = Record<string, unknown> & { id: string };
type NodeRecord = DiffRecord & { viewId: string; parentId?: string };

const SAFE_PROJECTION_CODES = new Set([
  'DTO_UNSUPPORTED_FIELDS',
  'IMPORT_PARSE_WARNING',
  'IMPORT_REFERENCE_UNRESOLVED',
  'IMPORT_TYPE_UNSUPPORTED',
  'MEFF_DIAGRAMS_UNSUPPORTED',
  'MEFF_DIAGRAM_NODE_TYPE_UNSUPPORTED',
  'MEFF_DIAGRAM_CONNECTION_TYPE_UNSUPPORTED',
  'MEFF_ELEMENTS_UNSUPPORTED',
  'MEFF_EXTENSIONS_UNSUPPORTED',
  'MEFF_MODEL_FIELDS_UNSUPPORTED',
  'MEFF_MODEL_METADATA_UNSUPPORTED',
  'MEFF_RELATIONSHIPS_UNSUPPORTED',
  'MEFF_VIEWPOINT_FIELD_UNSUPPORTED',
  'MEFF_VIEWS_UNSUPPORTED'
]);

const SAFE_PATH_ROOTS = new Set([
  'diagnostics', 'elements', 'propertyDefinitions', 'relationships', 'views'
]);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) =>
      item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) =>
      [key, canonical(item)]));
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function sameData(input: unknown, validated: unknown): boolean {
  if (Array.isArray(input) || Array.isArray(validated)) {
    if (!Array.isArray(input) || !Array.isArray(validated) ||
      input.length !== validated.length) return false;
    const keys = Object.keys(input);
    const enumerableSymbols = Object.getOwnPropertySymbols(input).filter((key) =>
      Object.getOwnPropertyDescriptor(input, key)?.enumerable).length;
    if (enumerableSymbols || keys.length !== input.length || keys.some((key) => {
      const index = Number(key);
      return !Number.isInteger(index) || index < 0 || index >= input.length ||
        String(index) !== key;
    })) return false;
    for (let index = 0; index < input.length; index++) {
      if (!Object.hasOwn(input, index) || !Object.hasOwn(validated, index) ||
        !sameData(input[index], validated[index])) return false;
    }
    return true;
  }
  if (input && typeof input === 'object' || validated && typeof validated === 'object') {
    if (!input || !validated || typeof input !== 'object' ||
      typeof validated !== 'object') return false;
    const source = input as Record<string, unknown>;
    const target = validated as Record<string, unknown>;
    const sourceSymbols = Object.getOwnPropertySymbols(source).some((key) =>
      Object.getOwnPropertyDescriptor(source, key)?.enumerable);
    const targetSymbols = Object.getOwnPropertySymbols(target).some((key) =>
      Object.getOwnPropertyDescriptor(target, key)?.enumerable);
    if (sourceSymbols || targetSymbols) return false;
    return Object.keys(source).every((key) => source[key] === undefined ||
      Object.hasOwn(target, key) && sameData(source[key], target[key])) &&
      Object.keys(target).every((key) => target[key] === undefined ||
        Object.hasOwn(source, key) && sameData(source[key], target[key]));
  }
  return input === validated;
}

function unsupportedFieldCount(input: unknown, validated: unknown): number {
  if (Array.isArray(input) && Array.isArray(validated)) {
    const keys = Object.keys(input);
    const indices = keys.filter((key) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < input.length &&
        String(index) === key;
    });
    const enumerableSymbols = Object.getOwnPropertySymbols(input).filter((key) =>
      Object.getOwnPropertyDescriptor(input, key)?.enumerable).length;
    let count = input.length - indices.length + keys.length - indices.length +
      enumerableSymbols;
    for (const key of indices) {
      const index = Number(key);
      count += unsupportedFieldCount(input[index], validated[index]);
    }
    return count;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !validated || typeof validated !== 'object' || Array.isArray(validated)) return 0;
  const source = input as Record<string, unknown>;
  const target = validated as Record<string, unknown>;
  const symbolCount = Object.getOwnPropertySymbols(source).filter((key) =>
    Object.getOwnPropertyDescriptor(source, key)?.enumerable).length;
  return Object.keys(source).reduce((count, key) => {
    if (source[key] === undefined) return count;
    if (!Object.hasOwn(target, key)) return count + 1;
    return count + unsupportedFieldCount(source[key], target[key]);
  }, symbolCount);
}

function detailPath(path: string, key: string): string {
  return `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function unsupportedFieldDetails(input: unknown, validated: unknown, path = ''): string[] {
  if (Array.isArray(input) && Array.isArray(validated)) {
    const keys = Object.keys(input);
    const indices = new Set(keys.filter((key) => {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 && index < input.length && String(index) === key;
    }));
    const own = keys.filter((key) => !indices.has(key)).map((key) => detailPath(path, key));
    const sparse = Array.from({ length: input.length }, (_, index) => index)
      .filter((index) => !Object.hasOwn(input, index)).map((index) => `${path}/${index}`);
    const symbols = Object.getOwnPropertySymbols(input).filter((key) =>
      Object.getOwnPropertyDescriptor(input, key)?.enumerable).map(() => `${path}/[symbol]`);
    const nested = [...indices].flatMap((key) =>
      unsupportedFieldDetails(input[Number(key)], validated[Number(key)], detailPath(path, key)));
    return [...own, ...sparse, ...symbols, ...nested];
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !validated || typeof validated !== 'object' || Array.isArray(validated)) return [];
  const source = input as Record<string, unknown>;
  const target = validated as Record<string, unknown>;
  const details = Object.keys(source).flatMap((key) => {
    if (source[key] === undefined) return [];
    return Object.hasOwn(target, key)
      ? unsupportedFieldDetails(source[key], target[key], detailPath(path, key))
      : [detailPath(path, key)];
  });
  return details.concat(Object.getOwnPropertySymbols(source).filter((key) =>
    Object.getOwnPropertyDescriptor(source, key)?.enumerable).map(() => `${path}/[symbol]`));
}

function uniqueDetails(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function safeProjectionCode(code: string): string {
  return SAFE_PROJECTION_CODES.has(code) ? code : 'unknown-construct';
}

function safeFieldDetail(detail: string): string {
  const root = detail.split('/').filter(Boolean)[0];
  return root && SAFE_PATH_ROOTS.has(root) ? `/${root}/unknown-field` : '/unknown-field';
}

function inspectEligibility(
  input: unknown, side: ModelDtoDiffEligibilityDiagnostic['input']
): ModelDtoDiffEligibilityDiagnostic[] {
  // Validation deliberately runs first so malformed DTOs keep the existing
  // MODEL_DTO_INVALID exception contract.
  const model = validateModelDto(input);
  const diagnostics: ModelDtoDiffEligibilityDiagnostic[] = [];
  const projectionCount = model.diagnostics.reduce((count) => count + 1, 0);
  if (projectionCount) diagnostics.push({ input: side,
    code: 'MODEL_DTO_DIFF_LOSSY_PROJECTION', count: projectionCount,
    details: uniqueDetails(model.diagnostics.map((item) => safeProjectionCode(item.code))) });
  const unsupported = unsupportedFieldCount(input, model);
  if (unsupported) diagnostics.push({ input: side,
    code: 'MODEL_DTO_DIFF_UNSUPPORTED_FIELDS', count: unsupported,
    details: uniqueDetails(unsupportedFieldDetails(input, model).map(safeFieldDetail)) });
  if (!sameData(input, model) && !unsupported && !projectionCount) {
    diagnostics.push({ input: side, code: 'MODEL_DTO_DIFF_NON_CANONICAL_DATA',
      count: 1, details: ['/'] });
  }
  return diagnostics;
}

/** Explain diff eligibility without returning DTO values or field names. */
export function assessModelDtoDiffEligibility(
  beforeInput: unknown, afterInput: unknown
): ModelDtoDiffEligibility {
  const diagnostics = [
    ...inspectEligibility(beforeInput, 'before'),
    ...inspectEligibility(afterInput, 'after')
  ].sort((left, right) => left.input === right.input
    ? left.code < right.code ? -1 : left.code > right.code ? 1 : 0
    : left.input === 'before' ? -1 : 1);
  return { eligible: diagnostics.length === 0, diagnostics };
}

function eligible(input: unknown): ModelDto {
  const model = validateModelDto(input);
  if (model.diagnostics.length || !sameData(input, model)) {
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

function elementContentKey(element: ElementDto): string {
  const content = Object.fromEntries(Object.entries(element).filter(([key]) =>
    key !== 'id' && key !== 'name'));
  return stable(content);
}

function groupByContent(elements: ElementDto[]): Map<string, ElementDto[]> {
  const groups = new Map<string, ElementDto[]>();
  for (const element of elements) {
    const key = elementContentKey(element);
    const group = groups.get(key) ?? [];
    group.push(element);
    groups.set(key, group);
  }
  return groups;
}

function inferElementRenameCandidates(
  before: ModelDto, after: ModelDto, changes: ModelDiffChange[]
): ModelDtoRenameCandidate[] {
  const beforeById = new Map(before.elements.map((element) => [element.id, element]));
  const afterById = new Map(after.elements.map((element) => [element.id, element]));
  const removed = changes.filter((change) => change.area === 'semantic' &&
    change.entity === 'element' && change.kind === 'removed').flatMap((change) => {
    const element = beforeById.get(change.id);
    return element ? [element] : [];
  });
  const added = changes.filter((change) => change.area === 'semantic' &&
    change.entity === 'element' && change.kind === 'added').flatMap((change) => {
    const element = afterById.get(change.id);
    return element ? [element] : [];
  });
  const oldGroups = groupByContent(removed);
  const newGroups = groupByContent(added);
  const candidates: ModelDtoRenameCandidate[] = [];
  for (const key of [...oldGroups.keys()].filter((value) => newGroups.has(value)).sort()) {
    const oldGroup = oldGroups.get(key)!;
    const newGroup = newGroups.get(key)!;
    if (oldGroup.length !== 1 || newGroup.length !== 1) continue;
    const oldElement = oldGroup[0];
    const newElement = newGroup[0];
    if (!oldElement.name || !newElement.name || oldElement.name === newElement.name) continue;
    candidates.push({ beforeId: oldElement.id, afterId: newElement.id,
      heuristic: true, confidence: 0.9,
      reason: 'unique-content-match-except-id-and-name' });
  }
  return candidates.sort((left, right) => left.beforeId < right.beforeId ? -1 :
    left.beforeId > right.beforeId ? 1 : left.afterId < right.afterId ? -1 :
      left.afterId > right.afterId ? 1 : 0);
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
  changes.sort((a, b) => {
    const left = stable([a.area, a.entity, a.viewId ?? '', a.id]);
    const right = stable([b.area, b.entity, b.viewId ?? '', b.id]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const renameCandidates = inferElementRenameCandidates(before, after, changes);
  return { schemaVersion: 1, changes,
    ...(renameCandidates.length ? { renameCandidates } : {}),
    impactedViewIds: impactedViews(changes, before, after) };
}
