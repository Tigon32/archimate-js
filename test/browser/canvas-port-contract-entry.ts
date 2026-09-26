// @ts-nocheck
// SYNTHETIC: Browser contract uses checked-in synthetic MEFF and generated canvas service doubles only.
// @ts-ignore The compiled DTO entry exists after compile:model-dto.
import { DiagramAdapter, DiagramJsCanvasPort, importMeffToModelDto } from '../../dist/model-dto/index.js';
// @ts-ignore Legacy RuleProvider is loaded through the browser compatibility bundle.
import ArchimateRules from '../../lib/features/rules/ArchimateRules.js';
import {
  createCanvasPortContractCases, summarizeProjection
} from '../contract/canvas-port-contract.mjs';

function removeElement(list, element) {
  const index = list.indexOf(element);
  if (index !== -1) list.splice(index, 1);
}

function makeEventBus() {
  const listeners = new Map();
  return {
    on: (name, priorityOrListener, listener) => {
      if (typeof priorityOrListener === 'function') listener = priorityOrListener;
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    off: (name, listener) => listeners.get(name)?.delete(listener),
    fire: (name, event) => listeners.get(name)?.forEach((listener) => listener(event))
  };
}

function makeSelection(eventBus) {
  let selected = [];
  return {
    get: () => selected,
    select: (items) => {
      selected = items;
      eventBus.fire('selection.changed', { newSelection: items });
    }
  };
}

function makeCanvas(shapes, connections) {
  const root = { id: 'root', children: [] };
  return {
    getRootElement: () => root,
    addShape: (shape, parent = root) => {
      shape.parent = parent;
      parent.children ||= [];
      parent.children.push(shape);
      shapes.set(shape.id, shape);
      return shape;
    },
    addConnection: (connection) => {
      root.children.push(connection);
      connections.set(connection.id, connection);
      return connection;
    },
    removeShape: (shape) => {
      shapes.delete(shape.id);
      removeElement(shape.parent?.children || root.children, shape);
    },
    removeConnection: (connection) => {
      connections.delete(connection.id);
      removeElement(root.children, connection);
    }
  };
}

function makeModeling() {
  return {
    nativeCalls: 0,
    moveElements() { this.nativeCalls++; },
    resizeShape() { this.nativeCalls++; },
    updateLabel() { this.nativeCalls++; },
    createConnection() { this.nativeCalls++; },
    reconnect() { this.nativeCalls++; },
    removeElements() { this.nativeCalls++; },
    removeShape() { this.nativeCalls++; },
    removeConnection() { this.nativeCalls++; }
  };
}

function createHarness() {
  const shapes = new Map();
  const connections = new Map();
  const eventBus = makeEventBus();
  const selection = makeSelection(eventBus);
  const modeling = makeModeling();
  const services = {
    canvas: makeCanvas(shapes, connections),
    elementFactory: {
      createShape: (attributes) => ({ ...attributes, children: [] }),
      createConnection: (attributes) => ({ ...attributes })
    },
    eventBus,
    selection,
    modeling
  };
  const port = new DiagramJsCanvasPort(services);
  return harnessFromServices(port, shapes, connections, selection, modeling);
}

function harnessFromServices(port, shapes, connections, selection, modeling) {
  return {
    port,
    emitConnect: (sourceId, targetId, attributes) =>
      modeling.createConnection(shapes.get(sourceId), shapes.get(targetId), attributes),
    emitCommand: (command) => emitModelingCommand(command, shapes, modeling),
    emitBatchMove: (ids, delta) =>
      modeling.moveElements(ids.map((id) => shapes.get(id)).filter(Boolean), delta),
    emitDeleteMany: (ids) =>
      modeling.removeElements(ids.map((id) => shapes.get(id) || connections.get(id)).filter(Boolean)),
    emitSelection: (ids) => selection.select(ids.map((id) => shapes.get(id) || connections.get(id)).filter(Boolean)),
    emitRejectedGesture: (ids) =>
      modeling.moveElements(ids.map((id) => shapes.get(id)).filter(Boolean), { x: 1, y: 1 },
        shapes.get('node-service')),
    readRendered: () => renderedFromMaps(shapes, connections, selection)
  };
}

function emitModelingCommand(command, shapes, modeling) {
  if (command.type !== 'move') throw new TypeError('Contract harness supports move gestures only.');
  const shape = shapes.get(command.nodeId);
  const delta = shape ? { x: command.x - Number(shape.x), y: command.y - Number(shape.y) } :
    { x: command.x, y: command.y };
  return modeling.moveElements([shape], delta);
}

function renderedFromMaps(shapes, connections, selection) {
  const hasRenderedContent = Boolean(shapes.size || connections.size || selection.get().length);
  return {
    ...summarizeProjection(undefined),
    ...(hasRenderedContent ? { viewId: 'view-dto-export' } : {}),
    nodes: [...shapes.values()].map(renderedNode),
    connections: [...connections.values()].map((connection) => ({ id: connection.id,
      sourceId: connection.source?.id,
      targetId: connection.target?.id })),
    selectedIds: selection.get().map((item) => item.id)
  };
}

function renderedNode(shape) {
  const parentX = shape.parent?.id === 'root' ? 0 : Number(shape.parent?.x || 0);
  const parentY = shape.parent?.id === 'root' ? 0 : Number(shape.parent?.y || 0);
  return { id: shape.id, x: Number(shape.x) + parentX, y: Number(shape.y) + parentY,
    width: Number(shape.width), height: Number(shape.height) };
}

const assert = {
  equal: (actual, expected, message) => {
    if (actual !== expected) throw new Error(message || `Expected ${String(actual)} to equal ${String(expected)}`);
  },
  deepEqual: (actual, expected, message) => {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left !== right) throw new Error(message || `Values were not equal.\nactual=${left}\nexpected=${right}`);
  },
  notDeepEqual: (actual, expected, message) => {
    if (JSON.stringify(actual) === JSON.stringify(expected)) throw new Error(message || 'Values should differ.');
  },
  ok: (value, message) => {
    if (!value) throw new Error(message || 'Expected a truthy value.');
  },
  throws: (action, message) => {
    try { action(); } catch { return; }
    throw new Error(message || 'Expected action to throw.');
  }
};

async function runCanvasPortContract(fixtureXml) {
  const cases = createCanvasPortContractCases({
    api: { DiagramAdapter, importMeffToModelDto },
    fixtureXml,
    createHarness
  });
  const names = [];
  for (const contractCase of cases) {
    await contractCase.run(assert);
    names.push(contractCase.name);
  }
  return names;
}

function ruleNode(type) {
  return {
    type,
    businessObject: {
      type: 'Element',
      $instanceOf: (expected) => expected === 'archimate:Node'
    }
  };
}

function reconnectRuleDecision(sourceType, targetType, relationshipType) {
  const callbacks = new Map();
  const rules = Object.create(ArchimateRules.prototype);
  rules.addRule = (action, callback) => callbacks.set(action, callback);
  rules.init();
  return callbacks.get('connection.reconnect')({
    source: ruleNode(sourceType),
    target: ruleNode(targetType),
    connection: { type: relationshipType }
  });
}

function semanticDtoHarness(fixtureXml) {
  const model = importMeffToModelDto(fixtureXml);
  model.elements.find((item) => item.id === 'component-one').type = 'archimate:ApplicationComponent';
  model.elements.find((item) => item.id === 'service-two').type = 'archimate:ApplicationFunction';
  model.relationships = [];
  model.views[0].connections = [];
  const editor = new DiagramAdapter(model);
  const harness = createHarness();
  const detach = editor.attach('view-dto-export', harness.port);
  return { editor, harness, detach };
}

function rejectedConnectionResult(editor, harness) {
  const before = editor.serialize();
  let code;
  try {
    harness.emitConnect('node-component', 'node-service', {
      id: 'browser-unsupported-connection',
      type: 'Serving'
    });
  } catch (error) {
    code = error?.diagnostic?.code;
  }
  return {
    code,
    atomic: editor.serialize() === before,
    noHistory: editor.undo() === false
  };
}

function runRelationshipDecisionContract(fixtureXml) {
  const allowedRule = reconnectRuleDecision('ApplicationComponent', 'ApplicationFunction', 'Assignment');
  const disallowedRule = reconnectRuleDecision('DataObject', 'ApplicationFunction', 'Access');
  const unsupportedRule = reconnectRuleDecision('ApplicationComponent', 'ApplicationFunction', 'Serving');
  const { editor, harness, detach } = semanticDtoHarness(fixtureXml);
  const before = editor.serialize();
  harness.emitConnect('node-component', 'node-service', {
    id: 'browser-supported-connection',
    type: 'Assignment'
  });
  const supportedCommitted = editor.getModel().relationships.some((item) =>
    item.type === 'archimate:Assignment' &&
    item.sourceId === 'component-one' &&
    item.targetId === 'service-two'
  );
  const supportedUndo = editor.undo() && editor.serialize() === before;
  const unsupportedResult = rejectedConnectionResult(editor, harness);
  detach();
  return {
    allowedRule,
    disallowedRule,
    unsupportedDeferred: unsupportedRule === undefined,
    supportedCommitted,
    supportedUndo,
    unsupportedResult
  };
}

Object.assign(window, { CanvasPortContractTest: { runCanvasPortContract, runRelationshipDecisionContract } });
