// SYNTHETIC: Verifies canvas creation state and teardown without architecture data.
// @ts-expect-error jsdom does not publish declarations in this dependency graph.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';

it('creates a fresh business object and removes its delegated listener on destroy', async () => {
  const dom = new JSDOM('<!doctype html><svg></svg>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    Node: dom.window.Node,
    SVGElement: dom.window.SVGElement
  });
  const { default: CanvasCreate } = await import(
    '../../lib/features/canvas-create/CanvasCreate.js'
  );
  const svg = dom.window.document.querySelector('svg') as unknown as SVGSVGElement;
  const callbacks = new Map<string, Array<(context: any) => void>>();
  const eventBus = { on: (event: string, callback: (context: any) => void) => {
    callbacks.set(event, [ ...(callbacks.get(event) ?? []), callback ]);
  } };
  const createdAttributes: Array<Record<string, unknown>> = [];
  const elementFactory = { create: (_kind: string, attributes: Record<string, unknown>) => {
    createdAttributes.push(attributes);
    return {
      ...attributes,
      type: String(attributes.type),
      businessObject: { $instanceOf: () => true }
    };
  } };
  const modeling = { createShape: (shape: any) => shape };
  CanvasCreate(eventBus, elementFactory, { getRootElement: () => ({}) },
    { activate: () => {} }, modeling);
  callbacks.get('canvas.init')?.[0]({ svg });
  callbacks.get('create.end')?.[0]({
    shape: {
      type: 'archimate:ApplicationComponent',
      businessObject: { $instanceOf: () => true }
    }
  });

  svg.dispatchEvent(new dom.window.MouseEvent('dblclick', {
    bubbles: true, clientX: 10, clientY: 20
  }));
  expect(createdAttributes).toHaveLength(1);
  expect(createdAttributes[0].type).toBe('archimate:ApplicationComponent');
  expect(createdAttributes[0].businessObject).toBeUndefined();

  callbacks.get('diagram.destroy')?.[0]({});
  svg.dispatchEvent(new dom.window.MouseEvent('dblclick', {
    bubbles: true, clientX: 30, clientY: 40
  }));
  expect(createdAttributes).toHaveLength(1);
  dom.window.close();
});
