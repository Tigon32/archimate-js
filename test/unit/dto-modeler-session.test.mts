// SYNTHETIC: Uses the checked-in, hand-authored MEFF fixture and synthetic service doubles.
import { expect, it } from 'vitest';
// @ts-expect-error Node types are excluded from the browser project.
import { readFileSync } from 'node:fs';
import { DtoModelerSession } from '../../src/diagram-js-adapter/index.js';
import { importMeffToModelDto, serializeModelDto } from '../../src/model-dto/index.js';

const supported = readFileSync('test/fixtures/synthetic/dto-export-view.xml', 'utf8');
const unsupported = readFileSync('test/fixtures/meff-schema/valid-view-presentation.xml', 'utf8');

function modelerDouble() {
  let model: { xml: string } | undefined;
  const root = { id: 'root', children: [] as Array<Record<string, unknown>> };
  const listeners = new Map<string, Set<() => void>>();
  const services = {
    canvas: {
      getRootElement: () => root,
      addShape(shape: Record<string, unknown>, parent = root) {
        (parent.children as Array<Record<string, unknown>>).push(shape);
      },
      addConnection(connection: Record<string, unknown>) { root.children.push(connection); },
      removeShape(shape: Record<string, unknown>) { root.children.splice(root.children.indexOf(shape), 1); },
      removeConnection(connection: Record<string, unknown>) { root.children.splice(root.children.indexOf(connection), 1); }
    },
    elementFactory: {
      createShape: (input: Record<string, unknown>) => ({ ...input, children: [] }),
      createConnection: (input: Record<string, unknown>) => ({ ...input })
    },
    eventBus: {
      on(name: string, priorityOrListener: number | (() => void), callback?: () => void) {
        const listener = typeof priorityOrListener === 'function' ? priorityOrListener : callback!;
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(listener);
      },
      off(name: string, listener: () => void) { listeners.get(name)?.delete(listener); }
    },
    selection: { get: () => [], select: (_items: unknown[]) => {} },
    modeling: {
      moveElements() {}, resizeShape() {}, updateLabel() {}, createConnection() {},
      reconnect() {}, removeElements() {}, removeShape() {}, removeConnection() {}
    }
  };
  return {
    async importXML(xml: string) { model = { xml }; },
    getModel: () => model,
    get: (name: keyof typeof services) => services[name],
    async saveXML() { return { xml: model!.xml }; },
    fireNativeCommand: () => { for (const listener of listeners.get('commandStack.executed') || []) listener(); }
  };
}

it('saves only the committed DTO state with semantic and presentation fields', async () => {
  const modeler = modelerDouble();
  const session = await DtoModelerSession.open(modeler, supported, 'view-dto-export');
  expect(session.eligible).toBe(true);
  const editor = session.editor!;
  editor.execute({ type: 'move', viewId: 'view-dto-export', nodeId: 'node-component', x: 40, y: 50 });
  editor.execute({ type: 'label', viewId: 'view-dto-export', itemId: 'node-component', label: 'Changed' });
  editor.execute({ type: 'label', viewId: 'view-dto-export', itemId: 'serving-connection',
    label: 'Synthetic <serves> & more' });
  editor.select('view-dto-export', ['node-component']);
  editor.undo(); editor.redo();
  const saved = session.save();
  expect(serializeModelDto(importMeffToModelDto(saved.xml))).toBe(saved.dtoJson);
  expect(saved.dtoJson).toBe(editor.serialize());
  expect(saved.dtoJson).not.toMatch(/selectedIds|businessObject|\$parent|\$type/);
  expect(saved.xml).not.toMatch(/selectedIds|businessObject/);
  expect(editor.getModel().relationships[0]).toMatchObject({
    sourceId: 'component-one', targetId: 'service-two'
  });
  expect(editor.getModel().views[0].nodes[0].style).toMatchObject({ lineWidth: 7 });
  expect(saved.xml).toContain('<label>Synthetic &lt;serves&gt; &amp; more</label>');
  session.close();
});

it('keeps unsupported original available through legacy save but rejects DTO save', async () => {
  const modeler = modelerDouble();
  const session = await DtoModelerSession.open(modeler, unsupported);
  expect(session.eligible).toBe(false);
  expect(session.reasons).toMatchObject([{ code: 'DTO_UNSUPPORTED_FIELDS' }]);
  const before = modeler.getModel();
  expect(() => session.save()).toThrow(expect.objectContaining({ code: 'DTO_EDITING_INELIGIBLE' }));
  expect(modeler.getModel()).toBe(before);
  expect((await modeler.saveXML()).xml).toBe(unsupported);
});

it('rejects save after native command, later import, or close without partial results', async () => {
  const modeler = modelerDouble();
  const session = await DtoModelerSession.open(modeler, supported);
  session.editor!.execute({ type: 'move', viewId: 'view-dto-export', nodeId: 'node-component', x: 42, y: 45 });
  expect(session.save().xml).toContain('node-component');
  modeler.fireNativeCommand();
  expect(() => session.save()).toThrow(expect.objectContaining({ code: 'DTO_EDITING_INELIGIBLE' }));
  session.close();
  const next = await DtoModelerSession.open(modeler, supported);
  await modeler.importXML(unsupported);
  expect(() => next.save()).toThrow(expect.objectContaining({ code: 'DTO_EDITING_INELIGIBLE' }));
  next.close();
  expect(() => next.save()).toThrow(expect.objectContaining({ code: 'DTO_EDITING_INELIGIBLE' }));
});

it('fails the whole save if a committed DTO command leaves the declared MEFF subset', async () => {
  const session = await DtoModelerSession.open(modelerDouble(), supported);
  session.editor!.execute({ type: 'move', viewId: 'view-dto-export', nodeId: 'node-component',
    x: 42.5, y: 45 });
  expect(() => session.save()).toThrow(expect.objectContaining({ code: 'MEFF_DTO_EXPORT_INVALID' }));
  expect(session.editor!.getModel().views[0].nodes[0].x).toBe(42.5);
  session.close();
});

it('never attributes a label to a duplicate visual ID in another view', async () => {
  const session = await DtoModelerSession.open(modelerDouble(), supported);
  const model = session.editor!.getModel();
  const copy = structuredClone(model.views[0].nodes[0]);
  copy.label = 'Different second-view label';
  model.views.push({ id: 'second-view', nodes: [copy], connections: [] });
  // The public DTO exporter must either encode each view correctly or reject it.
  const { DiagramAdapter } = await import('../../src/model-dto/index.js');
  try {
    const saved = new DiagramAdapter(model).exportMeff();
    const imported = importMeffToModelDto(saved);
    expect(imported.views[0].nodes[0].label).toBeUndefined();
    expect(imported.views[1].nodes[0].label).toBe('Different second-view label');
  } catch (error) {
    expect(error).toMatchObject({ code: 'DTO_EDITING_INELIGIBLE' });
  }
  session.close();
});
