// SYNTHETIC: Contract assertions use only the checked-in hand-authored DTO fixture.
import type {
  CanvasPort, CanvasProjection, EditorCommand, ModelDto
} from '../../src/model-dto/index.js';

export const CANVAS_PORT_CONTRACT_EXCLUDED_CASES = [
  'connect/reconnect/label gestures remain covered by targeted DiagramJsCanvasPort tests until every port exposes them.',
  'create-element remains out of scope for EE-M5 and is tracked by issue #332.'
];

type DiagramAdapterInstance = {
  attach(viewId: string, port: CanvasPort): () => void;
  execute(command: EditorCommand): void;
  getModel(): ModelDto;
  project(viewId: string): CanvasProjection;
  serialize(): string;
  select(viewId: string, ids: string[]): void;
  undo(): boolean;
  redo(): boolean;
};

export type CanvasPortContractApi = {
  DiagramAdapter: new (model: unknown) => DiagramAdapterInstance;
  importMeffToModelDto(xml: string): ModelDto;
};

export type RenderedCanvas = {
  viewId?: string;
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  connections: Array<{ id: string; sourceId?: string; targetId?: string }>;
  selectedIds: string[];
};

export type CanvasPortHarness = {
  port: CanvasPort;
  emitCommand(command: EditorCommand): unknown;
  emitBatchMove(ids: string[], delta: { x: number; y: number }): unknown;
  emitDeleteMany(ids: string[]): unknown;
  emitSelection(ids: string[]): unknown;
  emitRejectedGesture(ids: string[]): unknown;
  readRendered(): RenderedCanvas;
  capabilities?: { batchGestures?: boolean };
  teardown?(): void | Promise<void>;
};

export type CanvasPortContractOptions = {
  api: CanvasPortContractApi;
  fixtureXml: string;
  createHarness(): CanvasPortHarness | Promise<CanvasPortHarness>;
};

export type ContractAssert = {
  equal(actual: unknown, expected: unknown, message?: string): void;
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
  ok(value: unknown, message?: string): void;
  throws(action: () => unknown, message?: string): void;
};

export type ContractCase = { name: string; run(assert: ContractAssert): Promise<void> };

export type ContractRunner = {
  describe(name: string, define: () => void): void;
  it(name: string, run: () => Promise<void>): void;
  assert: ContractAssert;
};

export function summarizeProjection(projection: CanvasProjection | undefined): RenderedCanvas {
  return {
    viewId: projection?.viewId,
    nodes: (projection?.nodes || []).map((node) => ({ id: node.id, x: node.x, y: node.y,
      width: node.width, height: node.height })),
    connections: (projection?.connections || []).map((connection) => ({
      id: connection.id,
      ...(connection.sourceId ? { sourceId: connection.sourceId } : {}),
      ...(connection.targetId ? { targetId: connection.targetId } : {})
    })),
    selectedIds: [...(projection?.selectedIds || [])]
  };
}

export function createCanvasPortContractCases(options: CanvasPortContractOptions): ContractCase[] {
  return [
    { name: 'attaches and renders the active view projection', run: (assert) => withAttached(options, assert,
      ({ editor, harness, viewId }) => assert.deepEqual(harness.readRendered(),
        summarizeProjection(editor.project(viewId)))) },
    { name: 'routes gesture commands through the adapter and rerenders geometry', run: commandCase(options) },
    { name: 'routes batch move gestures as one undoable command', run: batchMoveCase(options) },
    { name: 'routes multi-item deletion as one undoable command', run: deleteManyCase(options) },
    { name: 'applies reversible layout patches as one undoable command', run: layoutPatchCase(options) },
    { name: 'maps selection ids from engine to adapter and back', run: selectionCase(options) },
    { name: 'keeps model and history unchanged for rejected gestures', run: rejectedCase(options) },
    { name: 'rerenders identical projections across undo and redo', run: undoRedoCase(options) },
    { name: 'detaches listeners, clears rendering, and ignores later gestures', run: detachCase(options) },
    { name: 'emits JSON round-trippable plain projections', run: plainProjectionCase(options) }
  ];
}

export function defineCanvasPortContract(name: string, options: CanvasPortContractOptions,
  runner: ContractRunner): void {
  runner.describe(name, () => {
    for (const contractCase of createCanvasPortContractCases(options)) {
      runner.it(contractCase.name, () => contractCase.run(runner.assert));
    }
  });
}

async function withAttached(options: CanvasPortContractOptions, assert: ContractAssert,
  action: (context: { editor: DiagramAdapterInstance; harness: CanvasPortHarness; viewId: string }) =>
    void | Promise<void>): Promise<void> {
  const viewId = 'view-dto-export';
  const editor = new options.api.DiagramAdapter(options.api.importMeffToModelDto(options.fixtureXml));
  const harness = await options.createHarness();
  let detach: (() => void) | undefined = editor.attach(viewId, harness.port);
  try {
    await action({ editor, harness, viewId });
  } finally {
    if (detach) detach();
    await harness.teardown?.();
    assert.ok(true);
  }
}

function commandCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return (assert) => withAttached(options, assert, ({ editor, harness, viewId }) => {
    harness.emitCommand({ type: 'move', viewId, nodeId: 'node-component', x: 35, y: 55 });
    const node = harness.readRendered().nodes.find((item) => item.id === 'node-component');
    assert.deepEqual(node, { id: 'node-component', x: 35, y: 55, width: 140, height: 70 });
    assert.deepEqual(harness.readRendered(), summarizeProjection(editor.project(viewId)));
  });
}

function batchMoveCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return (assert) => withAttached(options, assert, ({ editor, harness, viewId }) => {
    if (harness.capabilities?.batchGestures === false) return;
    const before = summarizeProjection(editor.project(viewId));
    harness.emitBatchMove(['node-component', 'node-service'], { x: 10, y: 15 });
    const moved = summarizeProjection(editor.project(viewId));
    assert.deepEqual(moved.nodes.find((item) => item.id === 'node-component'),
      { id: 'node-component', x: 30, y: 55, width: 140, height: 70 });
    assert.deepEqual(moved.nodes.find((item) => item.id === 'node-service'),
      { id: 'node-service', x: 310, y: 55, width: 140, height: 70 });
    assert.equal(editor.undo(), true);
    assert.deepEqual(harness.readRendered(), before);
  });
}

function deleteManyCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return (assert) => withAttached(options, assert, ({ editor, harness, viewId }) => {
    if (harness.capabilities?.batchGestures === false) return;
    const semanticCount = editor.getModel().elements.length + editor.getModel().relationships.length;
    harness.emitDeleteMany(['node-component', 'serving-connection']);
    const projection = editor.project(viewId);
    assert.equal(projection.nodes.some((item) => item.id === 'node-component'), false);
    assert.equal(projection.connections.some((item) => item.id === 'serving-connection'), false);
    assert.equal(editor.getModel().elements.length + editor.getModel().relationships.length, semanticCount);
    assert.equal(editor.undo(), true);
    assert.ok(editor.project(viewId).nodes.some((item) => item.id === 'node-component'));
  });
}

function layoutPatchCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return (assert) => withAttached(options, assert, ({ editor, viewId }) => {
    const projection = editor.project(viewId);
    const node = projection.nodes.find((item) => item.id === 'node-component')!;
    const connection = projection.connections.find((item) => item.id === 'serving-connection')!;
    const patch = { viewId, nodes: [{ id: node.id,
      before: { x: node.x, y: node.y, width: node.width, height: node.height },
      after: { x: node.x + 40, y: node.y + 20, width: node.width, height: node.height } }],
    connections: [{ id: connection.id, before: connection.waypoints,
      after: connection.waypoints.map((point) => ({ ...point, x: point.x + 40, y: point.y + 20 })) }] };
    editor.execute({ type: 'apply-layout-patch', viewId, patch, side: 'after' });
    assert.deepEqual(editor.project(viewId).nodes.find((item) => item.id === node.id),
      { ...node, x: node.x + 40, y: node.y + 20 });
    assert.throws(() => editor.execute({ type: 'apply-layout-patch', viewId, patch, side: 'after' }));
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.project(viewId), projection);
  });
}

function selectionCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return (assert) => withAttached(options, assert, ({ editor, harness, viewId }) => {
    harness.emitSelection(['node-service']);
    assert.deepEqual(editor.project(viewId).selectedIds, ['node-service']);
    assert.deepEqual(harness.readRendered().selectedIds, ['node-service']);
    editor.select(viewId, ['serving-connection']);
    assert.deepEqual(harness.readRendered().selectedIds, ['serving-connection']);
  });
}

function rejectedCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return (assert) => withAttached(options, assert, ({ editor, harness }) => {
    const before = editor.serialize();
    assert.throws(() => harness.emitRejectedGesture(['node-component']));
    assert.equal(editor.serialize(), before);
    assert.equal(editor.undo(), false);
  });
}

function undoRedoCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return (assert) => withAttached(options, assert, ({ editor, harness, viewId }) => {
    const original = summarizeProjection(editor.project(viewId));
    harness.emitCommand({ type: 'move', viewId, nodeId: 'node-service', x: 250, y: 60 });
    const moved = summarizeProjection(editor.project(viewId));
    assert.notDeepEqual(moved, original);
    assert.equal(editor.undo(), true);
    assert.deepEqual(harness.readRendered(), original);
    assert.equal(editor.redo(), true);
    assert.deepEqual(harness.readRendered(), moved);
  });
}

function detachCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return async (assert) => {
    const viewId = 'view-dto-export';
    const editor = new options.api.DiagramAdapter(options.api.importMeffToModelDto(options.fixtureXml));
    const harness = await options.createHarness();
    const detach = editor.attach(viewId, harness.port);
    const before = editor.serialize();
    detach();
    assert.deepEqual(harness.readRendered(), { nodes: [], connections: [], selectedIds: [] });
    harness.emitCommand({ type: 'move', viewId, nodeId: 'node-component', x: 45, y: 65 });
    harness.emitSelection(['node-service']);
    assert.equal(editor.serialize(), before);
    assert.deepEqual(editor.project(viewId).selectedIds, []);
    await harness.teardown?.();
  };
}

function plainProjectionCase(options: CanvasPortContractOptions): ContractCase['run'] {
  return (assert) => withAttached(options, assert, ({ editor, viewId }) => {
    const projection = editor.project(viewId);
    assert.deepEqual(JSON.parse(JSON.stringify(projection)), projection);
  });
}
