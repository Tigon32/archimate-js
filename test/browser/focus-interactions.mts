// SYNTHETIC: Exercises editor focus and cleanup with the checked-in synthetic MEFF fixture.
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { copyFile, unlink } from 'node:fs/promises';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { createServer } from 'node:http';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import path from 'node:path';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/focus-interactions-entry.generated.js');
await copyFile(path.join(root, 'test/browser/focus-interactions-entry.ts'), entryPath);

try {
  const compiler = webpack({
    mode: 'development',
    target: 'web',
    entry: entryPath,
    output: { path: path.join(root, '.ci-build'), filename: 'focus-interactions-test.js' },
    module: { rules: [{ test: /\.(css|svg|ttf|woff2?)$/, type: 'asset/inline' }] },
    resolve: { extensions: [ '.ts', '.js', '.json' ] },
    stats: 'errors-warnings'
  });
  const stats = await new Promise<import('webpack').Stats>((resolve, reject) => {
    compiler.run((error, result) => compiler.close((closeError) => {
      if (error || closeError || !result) {
        reject(error || closeError || new Error('Browser compile failed.'));
      } else {
        resolve(result);
      }
    }));
  });
  assert.equal(stats.hasErrors(), false, JSON.stringify(stats.toJson({ all: false, errors: true }).errors));
} finally {
  await unlink(entryPath);
}

const routes = new Map([
  [ '/focus-interactions-test.js', '.ci-build/focus-interactions-test.js' ],
  [ '/synthetic.xml', 'test/fixtures/synthetic/dto-export-view.xml' ],
  [ '/diagram.css', 'node_modules/diagram-js/assets/diagram-js.css' ]
]);
const requestPaths: string[] = [];

const server = createServer((request: { url?: string }, response: {
  setHeader(name: string, value: string): void;
  writeHead(status: number): { end(body?: string): void };
}) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  requestPaths.push(pathname);
  const route = routes.get(pathname);
  if (!route) return void response.writeHead(404).end();
  response.setHeader('content-type', route.endsWith('.css')
    ? 'text/css; charset=utf-8'
    : route.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/javascript; charset=utf-8');
  response.writeHead(200).end(readFileSync(path.join(root, route)));
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    headless: true,
    args: [ '--no-sandbox', '--disable-setuid-sandbox' ]
  });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ url: '/diagram.css' });
  await page.addScriptTag({ url: '/focus-interactions-test.js' });

  await page.evaluate(async () => {
    const api = (window as unknown as {
      FocusInteractionsTest: { Modeler: new (options: { container: HTMLElement }) => {
        importXML(xml: string): Promise<unknown>;
        get(name: string): any;
        clear(): void;
        destroy(): void;
      } };
    }).FocusInteractionsTest;
    const activeListeners = new WeakMap<EventTarget, Map<string, number>>();
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      const listeners = activeListeners.get(this) || new Map<string, number>();
      listeners.set(type, (listeners.get(type) || 0) + 1);
      activeListeners.set(this, listeners);
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      const listeners = activeListeners.get(this) || new Map<string, number>();
      listeners.set(type, Math.max(0, (listeners.get(type) || 0) - 1));
      activeListeners.set(this, listeners);
      return originalRemove.call(this, type, listener, options);
    };

    const xml = await (await fetch('/synthetic.xml')).text();
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '500px';
    document.body.append(container);
    const modeler = new api.Modeler({ container });
    await modeler.importXML(xml);
    const canvas = modeler.get('canvas');
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('Modeler SVG should be mounted.');
    canvas.focus();
    const editableElement = modeler.get('elementRegistry').get('node-component');
    modeler.get('selection').select(editableElement);
    (window as any).__focusInteractions = { activeListeners, container, modeler, svg };
  });

  await page.evaluate(() => {
    const state = (window as any).__focusInteractions;
    const element = state.modeler.get('elementRegistry').get('node-component');
    state.modeler.get('directEditing').activate(element);
  });

  const result = await page.evaluate(async () => {
    const state = (window as any).__focusInteractions;
    const { activeListeners, container, modeler, svg } = state;
    const editor = container.querySelector('.djs-direct-editing-content') as HTMLElement | null;
    if (!editor) throw new Error('Label editing should create a contenteditable editor.');
    editor.focus();
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cancelRestoredFocus = document.activeElement === svg;

    await pageKeyboard('e');
    const reopenedEditor = container.querySelector('.djs-direct-editing-content') as HTMLElement | null;
    const keyboardReopenedEditing = Boolean(reopenedEditor);
    reopenedEditor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const completeRestoredFocus = document.activeElement === svg;
    await pageKeyboard('a', { ctrlKey: true });
    const selectedByKeyboard = modeler.get('selection').get().length >= 2;

    const selection = modeler.get('selection');
    const element = modeler.get('elementRegistry').get('node-component');
    selection.select(element);
    const contextPad = modeler.get('contextPad');
    contextPad.open(element, true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const contextOpened = contextPad.isOpen();
    const popupMenu = modeler.get('popupMenu');
    popupMenu.open(element, 'text-options', {
      x: 0,
      y: 0,
      cursor: { x: 0, y: 0 }
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const popupOpened = Boolean(container.querySelector('.djs-popup'));
    popupMenu.close();
    contextPad.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const popupRestoredFocus = document.activeElement === svg;
    const contextClosed = contextOpened && !contextPad.isOpen() && !container.querySelector('.djs-popup');

    await pageKeyboard('e');
    const editingBeforeClear = Boolean(container.querySelector('.djs-direct-editing-content'));
    modeler.clear();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const clearRemovedEditing = !container.querySelector('.djs-direct-editing-parent');
    const listenerCountBeforeDestroy = listenerTotal(activeListeners.get(svg));
    modeler.destroy();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const destroyRemovedDom = !container.querySelector('.djs-direct-editing-parent') && !container.querySelector('svg');
    const listenerCountAfterDestroy = listenerTotal(activeListeners.get(svg));
    const listenerTypesAfterDestroy = (Array.from(
      activeListeners.get(svg)?.entries() || []
    ) as Array<[string, number]>).filter((entry) => entry[1] > 0);
    container.remove();
    delete (window as any).__focusInteractions;

    async function pageKeyboard(key: string, modifiers: KeyboardEventInit = {}) {
      svg.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }));
    }

    return {
      cancelRestoredFocus,
      completeRestoredFocus,
      keyboardReopenedEditing,
      selectedByKeyboard,
      popupOpened,
      popupRestoredFocus,
      contextClosed,
      editingBeforeClear,
      clearRemovedEditing,
      destroyRemovedDom,
      listenerCountBeforeDestroy,
      listenerCountAfterDestroy,
      listenerTypesAfterDestroy
    };

    function listenerTotal(listeners: Map<string, number> | undefined) {
      return Array.from(listeners?.values() || []).reduce((total, count) => total + count, 0);
    }
  });

  assert.equal(result.cancelRestoredFocus, true);
  assert.equal(result.completeRestoredFocus, true);
  assert.equal(result.keyboardReopenedEditing, true);
  assert.equal(result.selectedByKeyboard, true);
  assert.equal(result.popupOpened, true);
  assert.equal(result.popupRestoredFocus, true);
  assert.equal(result.contextClosed, true);
  assert.equal(result.editingBeforeClear, true);
  assert.equal(result.clearRemovedEditing, true);
  assert.equal(result.destroyRemovedDom, true);
  assert.ok(result.listenerCountBeforeDestroy > 0);
  assert.deepEqual(result.listenerTypesAfterDestroy, [
    [ 'focusin', 1 ],
    [ 'focusout', 1 ],
    [ 'mouseover', 1 ],
    [ 'mouseout', 1 ],
    [ 'dblclick', 1 ]
  ]);
  assert.deepEqual(requestPaths.sort(), [
    '/',
    '/diagram.css',
    '/focus-interactions-test.js',
    '/synthetic.xml'
  ]);
  console.log('focus and interaction browser checks passed');
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
