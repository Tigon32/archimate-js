import { validateModelDto } from './validate.js';
import type {
  ElementDto, ModelDto, RelationshipDto, ViewConnectionDto, ViewDto, ViewNodeDto
} from './types.js';

export type ModelTreeItemKind = ViewNodeDto['kind'] | ViewConnectionDto['kind'];

export interface ModelTreeItem {
  id: string;
  kind: ModelTreeItemKind;
  type: string;
  name: string;
  accessibleName: string;
  selected: boolean;
  children: ModelTreeItem[];
  parentId?: string;
  sourceNodeId?: string;
  targetNodeId?: string;
}

export interface ModelTree {
  viewId: string;
  viewName: string;
  selectedItemId?: string;
  items: ModelTreeItem[];
}

export type ModelTreeEvent = { type: 'changed' | 'selection'; tree: ModelTree };

export interface ModelTreeAdapterEvent {
  type: 'changed' | 'selection';
  viewId: string;
  model: ModelDto;
  selectedIds: string[];
}

export interface ModelTreeAdapter {
  getModel(): ModelDto;
  project(viewId: string): { selectedIds: string[] };
  select(viewId: string, ids: string[]): void;
  subscribe(listener: (event: ModelTreeAdapterEvent) => void): () => void;
}

export interface ModelTreeService {
  getTree(): ModelTree;
  onChange(callback: (event: ModelTreeEvent) => void): () => void;
  selectItem(id: string): boolean;
  setView(viewId: string): boolean;
  dispose(): void;
}

function fail(code: string, message: string): never {
  throw Object.assign(new TypeError(message), { code });
}

function visibleName(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function plainType(type: string): string {
  return type.replace(/^archimate:/, '');
}

function itemName(type: string, id: string, selected: boolean, name?: string): string {
  const state = selected ? ', selected' : '';
  return `${type}: ${name ?? `Unnamed ${type}`} [${id}]${state}`;
}

function nodeItem(source: ViewNodeDto, elements: Map<string, ElementDto>, selectedIds: Set<string>,
  parentId?: string): ModelTreeItem {
  const concept = source.elementId ? elements.get(source.elementId) : undefined;
  const type = concept ? plainType(concept.type) : source.kind === 'container' ? 'Group' : 'Label';
  const selected = selectedIds.has(source.id);
  const name = visibleName(source.label) ?? visibleName(concept?.name) ?? `Unnamed ${type}`;
  return {
    id: source.id, kind: source.kind, type, name,
    accessibleName: itemName(type, source.id, selected, name),
    selected,
    ...(parentId !== undefined ? { parentId } : {}),
    children: source.nodes.map((child) => nodeItem(child, elements, selectedIds, source.id))
  };
}

function flattenItems(items: ModelTreeItem[]): ModelTreeItem[] {
  return items.flatMap((item) => [item, ...flattenItems(item.children)]);
}

function connectionItem(connection: ViewConnectionDto, relationships: Map<string, RelationshipDto>,
  nodes: Map<string, ModelTreeItem>, selectedIds: Set<string>): ModelTreeItem {
  const concept = connection.relationshipId ? relationships.get(connection.relationshipId) : undefined;
  const type = concept ? plainType(concept.type) : 'Line';
  const source = connection.sourceId ? nodes.get(connection.sourceId) : undefined;
  const target = connection.targetId ? nodes.get(connection.targetId) : undefined;
  const name = visibleName(connection.label) ?? visibleName(concept?.name) ??
    `${type} from ${source?.name ?? 'unknown node'} to ${target?.name ?? 'unknown node'}`;
  const selected = selectedIds.has(connection.id);
  return {
    id: connection.id, kind: connection.kind, type, name,
    accessibleName: itemName(type, connection.id, selected, name),
    selected,
    ...(connection.sourceId !== undefined ? { sourceNodeId: connection.sourceId } : {}),
    ...(connection.targetId !== undefined ? { targetNodeId: connection.targetId } : {}),
    children: []
  };
}

function firstSelected(items: ModelTreeItem[]): string | undefined {
  const match = flattenItems(items).find((item) => item.selected);
  return match?.id;
}

/** Build a detached, deterministic model tree for one DTO view; no renderer is needed. */
export function createModelTree(model: unknown, viewId: string, selectedIds: string[] = []): ModelTree {
  const dto = validateModelDto(model);
  if (typeof viewId !== 'string') fail('MODEL_TREE_VIEW_NOT_FOUND', 'The requested view is unavailable.');
  const view = dto.views.find((item) => item.id === viewId);
  if (!view) fail('MODEL_TREE_VIEW_NOT_FOUND', 'The requested view is unavailable.');
  return treeFromView(dto, view, selectedIds);
}

function treeFromView(dto: ModelDto, view: ViewDto, selectedIds: string[]): ModelTree {
  const selected = new Set(selectedIds);
  const nodes = view.nodes.map((node) => nodeItem(node,
    new Map(dto.elements.map((element) => [element.id, element])), selected));
  const nodeIndex = new Map(flattenItems(nodes).map((node) => [node.id, node]));
  const relationships = new Map(dto.relationships.map((relationship) => [relationship.id, relationship]));
  const items = [...nodes, ...view.connections.map((connection) =>
    connectionItem(connection, relationships, nodeIndex, selected))];
  return { viewId: view.id, viewName: visibleName(view.name) ?? 'Unnamed view',
    selectedItemId: firstSelected(items), items };
}

function cloneTree(tree: ModelTree): ModelTree {
  return structuredClone(tree) as ModelTree;
}

function hasItem(tree: ModelTree, id: string): boolean {
  return flattenItems(tree.items).some((item) => item.id === id);
}

function safeTree(model: unknown, viewId: string, selectedIds: string[]): ModelTree | undefined {
  try { return createModelTree(model, viewId, selectedIds); }
  catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

function selectedIds(adapter: ModelTreeAdapter, viewId: string): string[] {
  return adapter.project(viewId).selectedIds;
}

/** Keep a headless model tree synchronized with the DTO adapter selection boundary. */
export function createModelTreeService(adapter: ModelTreeAdapter, viewId: string): ModelTreeService {
  let activeViewId = viewId;
  let disposed = false;
  let tree = createModelTree(adapter.getModel(), activeViewId, selectedIds(adapter, activeViewId));
  const callbacks = new Set<(event: ModelTreeEvent) => void>();
  const unsubscribe = adapter.subscribe((event) => {
    if (disposed || event.viewId !== activeViewId) return;
    const next = safeTree(event.model, activeViewId, event.selectedIds);
    if (!next) {
      tree = { ...tree, selectedItemId: undefined, items: tree.items.map(clearSelected) };
      emit('selection');
      return;
    }
    tree = next;
    emit(event.type);
  });
  const emit = (type: ModelTreeEvent['type']): void => {
    const event = { type, tree: cloneTree(tree) };
    for (const callback of callbacks) callback(event);
  };
  return serviceApi(adapter, () => disposed, (value) => { disposed = value; },
    () => activeViewId, (value) => { activeViewId = value; }, () => tree,
    (value) => { tree = value; }, callbacks, unsubscribe, emit);
}

function serviceApi(adapter: ModelTreeAdapter, isDisposed: () => boolean,
  setDisposed: (disposed: boolean) => void, viewId: () => string, setViewId: (viewId: string) => void,
  getCurrent: () => ModelTree, setCurrent: (tree: ModelTree) => void,
  callbacks: Set<(event: ModelTreeEvent) => void>, unsubscribe: () => void,
  emit: (type: ModelTreeEvent['type']) => void): ModelTreeService {
  return {
    getTree: () => cloneTree(getCurrent()),
    onChange(callback) {
      if (isDisposed()) return () => {};
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
    selectItem(id) {
      if (isDisposed() || typeof id !== 'string' || !hasItem(getCurrent(), id)) return false;
      adapter.select(viewId(), [id]);
      return true;
    },
    setView(nextViewId) {
      if (isDisposed()) return false;
      const ids = safeSelectedIds(adapter, nextViewId);
      const next = ids ? safeTree(adapter.getModel(), nextViewId, ids) : undefined;
      setCurrent(next ?? { ...getCurrent(), selectedItemId: undefined,
        items: getCurrent().items.map(clearSelected) });
      if (!next) { emit('selection'); return false; }
      setViewId(nextViewId);
      emit('changed');
      return true;
    },
    dispose() {
      if (isDisposed()) return;
      setDisposed(true);
      callbacks.clear();
      unsubscribe();
    }
  };
}

function safeSelectedIds(adapter: ModelTreeAdapter, viewId: string): string[] | undefined {
  try { return selectedIds(adapter, viewId); }
  catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

function clearSelected(item: ModelTreeItem): ModelTreeItem {
  return { ...item, selected: false, accessibleName: itemName(item.type, item.id, false, item.name),
    children: item.children.map(clearSelected) };
}
