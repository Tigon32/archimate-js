// SYNTHETIC: Hand-authored DTOs with no customer content.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { readFileSync } from 'node:fs';
import {
  createModelTree, createModelTreeService, DiagramAdapter, importMeffToModelDto
} from '../../src/model-dto/index.js';
import type {
  ModelDto, ModelTreeAdapter, ModelTreeAdapterEvent, ModelTreeEvent
} from '../../src/model-dto/index.js';

function node(id: string, elementId: string, label?: string) {
  return { id, kind: 'element' as const, elementId, x: 0, y: 0, width: 100, height: 50,
    ...(label !== undefined ? { label } : {}), nodes: [] };
}

function treeFixture(): ModelDto {
  return { schemaVersion: 1, id: 'synthetic-model', diagnostics: [],
    elements: [
      { id: 'app-one', type: 'archimate:ApplicationComponent', name: 'Repeated' },
      { id: 'app-two', type: 'archimate:ApplicationComponent', name: 'Repeated' },
      { id: 'actor-one', type: 'archimate:BusinessActor', name: 'Actor' }
    ],
    relationships: [
      { id: 'rel-one', type: 'archimate:Serving', sourceId: 'app-one', targetId: 'actor-one',
        name: 'Repeated' }
    ],
    views: [
      { id: 'view-one', name: 'Primary', nodes: [
        { id: 'group-one', kind: 'container', x: 0, y: 0, width: 300, height: 200,
          nodes: [node('node-one', 'app-one'), { id: 'group-two', kind: 'container',
            label: 'Nested', x: 20, y: 20, width: 200, height: 120,
            nodes: [node('node-two', 'app-two')] }] },
        node('node-three', 'actor-one', 'Repeated')
      ], connections: [
        { id: 'connection-one', kind: 'relationship', relationshipId: 'rel-one',
          sourceId: 'node-one', targetId: 'node-three', waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }
      ] },
      { id: 'empty-view', name: 'Empty', nodes: [], connections: [] }
    ] };
}

function editableFixture(): ModelDto {
  const dto = importMeffToModelDto(readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8'));
  dto.views.push({ id: 'empty-view', name: 'Empty', nodes: [], connections: [] });
  return dto;
}

function countedAdapter(editor: DiagramAdapter): ModelTreeAdapter & {
  listenerCount(): number;
  selectCalls(): number;
} {
  let listeners = 0;
  let selects = 0;
  return {
    getModel: () => editor.getModel(),
    project: (viewId) => editor.project(viewId),
    select(viewId, ids) { selects++; editor.select(viewId, ids); },
    subscribe(listener: (event: ModelTreeAdapterEvent) => void) {
      listeners++;
      const unsubscribe = editor.subscribe(listener);
      return () => { listeners--; unsubscribe(); };
    },
    listenerCount: () => listeners,
    selectCalls: () => selects
  };
}

function itemIds(tree: ReturnType<typeof createModelTree>): string[] {
  return tree.items.flatMap((item): string[] => [item.id, ...item.children.flatMap((child) => itemIds({
    viewId: tree.viewId, viewName: tree.viewName, items: [child]
  }))]);
}

it('builds nested DTO hierarchy with deterministic order and unique accessible names for repeated labels', () => {
  const tree = createModelTree(treeFixture(), 'view-one', ['node-two']);
  expect(tree.viewName).toBe('Primary');
  expect(tree.selectedItemId).toBe('node-two');
  expect(tree.items.map((item) => item.id)).toEqual(['group-one', 'node-three', 'connection-one']);
  expect(tree.items[0].children.map((item) => item.id)).toEqual(['node-one', 'group-two']);
  expect(tree.items[0].children[1].children[0]).toMatchObject({
    id: 'node-two', name: 'Repeated', selected: true,
    accessibleName: 'ApplicationComponent: Repeated [node-two], selected',
    parentId: 'group-two'
  });
  expect(tree.items[1].accessibleName).toBe('BusinessActor: Repeated [node-three]');
  expect(tree.items[2]).toMatchObject({
    id: 'connection-one', name: 'Repeated', sourceNodeId: 'node-one', targetNodeId: 'node-three',
    accessibleName: 'Serving: Repeated [connection-one]'
  });
});

it('represents empty views and missing selected IDs without stale selection', () => {
  const tree = createModelTree(treeFixture(), 'empty-view', ['missing-id']);
  expect(tree).toMatchObject({ viewId: 'empty-view', viewName: 'Empty', items: [] });
  expect(tree.selectedItemId).toBeUndefined();
  expect(() => createModelTree(treeFixture(), 'missing-view')).toThrow(expect.objectContaining({
    code: 'MODEL_TREE_VIEW_NOT_FOUND'
  }));
});

it('selecting a tree item selects the matching canvas object through the adapter', () => {
  const editor = new DiagramAdapter(editableFixture());
  const adapter = countedAdapter(editor);
  const service = createModelTreeService(adapter, 'view-dto-export');
  const events: ModelTreeEvent[] = [];
  service.onChange((event) => events.push(event));
  expect(service.selectItem('serving-connection')).toBe(true);
  expect(editor.project('view-dto-export').selectedIds).toEqual(['serving-connection']);
  expect(events.at(-1)?.tree.selectedItemId).toBe('serving-connection');
  expect(events.at(-1)?.type).toBe('selection');
  service.dispose();
});

it('canvas selection events update the selected tree item', () => {
  const editor = new DiagramAdapter(editableFixture());
  const service = createModelTreeService(countedAdapter(editor), 'view-dto-export');
  editor.select('view-dto-export', ['node-service']);
  expect(service.getTree().selectedItemId).toBe('node-service');
  expect(service.getTree().items[1]).toMatchObject({
    id: 'node-service', selected: true,
    accessibleName: 'ApplicationService: Service Two [node-service], selected'
  });
  service.dispose();
});

it('initializes selected tree state from the adapter projection', () => {
  const editor = new DiagramAdapter(editableFixture());
  editor.select('view-dto-export', ['node-service-nested']);
  const service = createModelTreeService(countedAdapter(editor), 'view-dto-export');
  expect(service.getTree().selectedItemId).toBe('node-service-nested');
  expect(service.getTree().items[0].children[0].selected).toBe(true);
  service.dispose();
});

it('fails safely for missing IDs and view changes without retaining stale selection', () => {
  const editor = new DiagramAdapter(editableFixture());
  const adapter = countedAdapter(editor);
  const service = createModelTreeService(adapter, 'view-dto-export');
  expect(service.selectItem('missing-id')).toBe(false);
  expect(adapter.selectCalls()).toBe(0);
  editor.select('view-dto-export', ['node-component']);
  expect(service.getTree().selectedItemId).toBe('node-component');
  expect(service.setView('empty-view')).toBe(true);
  expect(service.getTree()).toMatchObject({ viewId: 'empty-view', items: [] });
  expect(service.getTree().selectedItemId).toBeUndefined();
  expect(service.setView('missing-view')).toBe(false);
  expect(service.getTree().selectedItemId).toBeUndefined();
  service.dispose();
});

it('drops stale selection when the active DTO view changes', () => {
  const editor = new DiagramAdapter(editableFixture());
  const service = createModelTreeService(countedAdapter(editor), 'view-dto-export');
  editor.select('view-dto-export', ['node-service']);
  editor.execute({ type: 'delete', viewId: 'view-dto-export', itemId: 'node-service' });
  const tree = service.getTree();
  expect(tree.selectedItemId).toBeUndefined();
  expect(itemIds(tree)).not.toContain('node-service');
  service.dispose();
});

it('dispose removes adapter and service listeners and stops further sync', () => {
  const editor = new DiagramAdapter(editableFixture());
  const adapter = countedAdapter(editor);
  const baseline = adapter.listenerCount();
  const service = createModelTreeService(adapter, 'view-dto-export');
  const off = service.onChange(() => {});
  expect(adapter.listenerCount()).toBe(baseline + 1);
  off();
  service.dispose();
  expect(adapter.listenerCount()).toBe(baseline);
  editor.select('view-dto-export', ['node-service']);
  expect(service.getTree().selectedItemId).toBeUndefined();
});
