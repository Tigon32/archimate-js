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
const listenerTrackerScript = `
(() => {
  const active = new Map();
  const listenerIds = new WeakMap();
  const targetIds = new WeakMap();
  const targetPrefixes = new WeakMap([[ window, 'window' ], [ document, 'document' ], [ document.body, 'body' ]]);
  let sequence = 0;
  let targetSequence = 0;
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  const captureFlag = (options) => typeof options === 'boolean' ? options : Boolean(options && options.capture);
  const targetId = (target) => {
    const existing = targetIds.get(target);
    if (existing) return existing;
    const prefix = targetPrefixes.get(target) || (target instanceof SVGSVGElement ? 'svg' : undefined);
    if (!prefix) return undefined;
    const id = prefix + '#' + (++targetSequence);
    targetIds.set(target, id);
    return id;
  };
  const markDetachedDiagramSvg = (target) => {
    const id = targetId(target);
    if (!id) return undefined;
    if (target instanceof SVGSVGElement) {
      target.setAttribute('data-focus-listener-target', id);
    }
    return id;
  };
  const listenerId = (listener) => {
    const existing = listenerIds.get(listener);
    if (existing) return existing;
    listenerIds.set(listener, ++sequence);
    return sequence;
  };
  const track = (target, type, listener, options, delta, registrationOrigin) => {
    const currentTargetId = markDetachedDiagramSvg(target);
    if (!currentTargetId || !listener) return;
    const currentListenerId = listenerId(listener);
    const capture = captureFlag(options);
    const key = currentTargetId + ':' + type + ':' + currentListenerId + ':' + capture;
    const listeners = active.get(currentTargetId) || new Map();
    if (delta > 0 && !listeners.has(key)) {
      listeners.set(key, {
        targetId: currentTargetId,
        type,
        listenerId: currentListenerId,
        capture,
        count: 1,
        registrationOrigin
      });
    } else if (delta < 0) {
      listeners.delete(key);
    }
    active.set(currentTargetId, listeners);
  };
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    track(this, type, listener, options, 1, new Error().stack || '');
    return originalAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    track(this, type, listener, options, -1, '');
    return originalRemove.call(this, type, listener, options);
  };
  window.__focusListenerTracker = {
    targetId: (target) => targetId(target),
    remainingListeners: () => Array.from(active.values()).flatMap((listeners) => Array.from(listeners.values()))
      .filter((record) => record.count > 0)
      .map(({ targetId, type, listenerId, capture, count, registrationOrigin }) =>
        ({ targetId, type, listenerId, capture, count, registrationOrigin }))
  };
})();
`;
const focusHelpersScript = `
window.__focusTestHelpers = {
  setup: async (api, xml) => {
    const tracker = window.__focusListenerTracker;
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '500px';
    document.body.append(container);
    const modeler = new api.Modeler({ container });
    await modeler.importXML(xml);
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('Modeler SVG should be mounted.');
    modeler.get('canvas').focus();
    modeler.get('selection').select(modeler.get('elementRegistry').get('node-component'));
    const keyboard = (key, modifiers = {}) =>
      svg.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }));
    const diagramTargetId = tracker.targetId(svg);
    const expectedRetainedListeners = tracker.remainingListeners()
      .filter((record) => record.targetId === diagramTargetId &&
        [ 'focusin', 'focusout', 'mouseout', 'mouseover' ].includes(record.type) &&
        record.registrationOrigin.includes('/diagram-js/lib/core/Canvas.js'))
      .sort((left, right) => left.listenerId - right.listenerId);
    if (expectedRetainedListeners.length !== 4 ||
        new Set(expectedRetainedListeners.map((record) => record.type)).size !== 4 ||
        new Set(expectedRetainedListeners.map((record) => record.listenerId)).size !== 4 ||
        expectedRetainedListeners.some((record) => record.capture || record.count !== 1)) {
      throw new Error('Diagram-js retained listener identities do not match the canonical set.');
    }
    const sameSvgProjectListener = () => {};
    const secondSvgProjectListener = () => {};
    const secondSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(secondSvg);
    const secondTargetId = tracker.targetId(secondSvg);
    svg.addEventListener('focusin', sameSvgProjectListener);
    secondSvg.addEventListener('focusout', secondSvgProjectListener, true);
    const controls = tracker.remainingListeners().filter((record) =>
      !record.registrationOrigin.includes('diagram-js') &&
      (record.targetId === diagramTargetId || record.targetId === secondTargetId));
    const controlsAreDistinct = controls.length === 2 &&
      new Set(controls.map((record) => record.listenerId)).size === 2 &&
      controls.some((record) => record.targetId === diagramTargetId &&
        record.type === 'focusin' && !record.capture) &&
      controls.some((record) => record.targetId === secondTargetId &&
        record.type === 'focusout' && record.capture);
    svg.removeEventListener('focusin', sameSvgProjectListener);
    secondSvg.removeEventListener('focusout', secondSvgProjectListener, true);
    secondSvg.remove();
    const controlIds = new Set(controls.map((record) => record.listenerId));
    const negativeControlsRemoved = !tracker.remainingListeners()
      .some((record) => controlIds.has(record.listenerId));
    return { container, modeler, svg, keyboard, diagramTargetId,
      expectedRetainedListeners, controlsAreDistinct, negativeControlsRemoved,
      remainingListeners: tracker.remainingListeners };
  },
  focusJourney: async (state) => {
    const { container, modeler, svg, keyboard } = state;
    const editor = container.querySelector('.djs-direct-editing-content');
    if (!editor) throw new Error('Label editing should create a contenteditable editor.');
    editor.focus();
    editor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', keyCode: 27, bubbles: true
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cancelRestoredFocus = document.activeElement === svg;
    keyboard('e');
    const reopenedEditor = container.querySelector('.djs-direct-editing-content');
    const keyboardReopenedEditing = Boolean(reopenedEditor);
    reopenedEditor?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', keyCode: 13, bubbles: true
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const completeRestoredFocus = document.activeElement === svg;
    keyboard('a', { ctrlKey: true });
    return { cancelRestoredFocus, completeRestoredFocus, keyboardReopenedEditing,
      selectedByKeyboard: modeler.get('selection').get().length >= 2 };
  },
  cleanupJourney: async (state) => {
    const { container, modeler, remainingListeners, svg, keyboard } = state;
    const element = modeler.get('elementRegistry').get('node-component');
    const contextPad = modeler.get('contextPad');
    modeler.get('selection').select(element);
    contextPad.open(element, true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const contextOpened = contextPad.isOpen();
    const popupMenu = modeler.get('popupMenu');
    popupMenu.open(element, 'text-options', { x: 0, y: 0, cursor: { x: 0, y: 0 } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const popupOpened = Boolean(container.querySelector('.djs-popup'));
    popupMenu.close();
    contextPad.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const popupRestoredFocus = document.activeElement === svg;
    const contextClosed = contextOpened && !contextPad.isOpen() &&
      !container.querySelector('.djs-popup');
    keyboard('e');
    const editingBeforeClear = Boolean(container.querySelector('.djs-direct-editing-content'));
    modeler.clear();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const clearRemovedEditing = !container.querySelector('.djs-direct-editing-parent');
    const listenerCountBeforeDestroy = remainingListeners().length;
    modeler.destroy();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const destroyRemovedDom = !container.querySelector('.djs-direct-editing-parent') &&
      !container.querySelector('svg');
    const detachedSvgUnreachable = !document.body.contains(svg);
    const retainedListeners = remainingListeners();
    container.remove();
    return { popupOpened, popupRestoredFocus, contextClosed, editingBeforeClear,
      clearRemovedEditing, destroyRemovedDom, detachedSvgUnreachable,
      listenerCountBeforeDestroy, retainedListeners };
  }
};
`;

const server = createServer((request: { url?: string }, response: {
  setHeader(name: string, value: string): void;
  writeHead(status: number): { end(body?: string): void };
}) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  requestPaths.push(pathname);
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    return void response.writeHead(200).end(
      '<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>'
    );
  }
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
  const browserRequests: string[] = [];
  const offOriginRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    browserRequests.push(url);
    if (url === origin || url.startsWith(origin + '/')) {
      await route.continue();
      return;
    }
    offOriginRequests.push(url);
    await route.abort();
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ url: '/diagram.css' });
  await page.addScriptTag({ content: listenerTrackerScript });
  await page.addScriptTag({ content: focusHelpersScript });
  await page.addScriptTag({ url: '/focus-interactions-test.js' });

  await page.evaluate(async () => {
    const xml = await (await fetch('/synthetic.xml')).text();
    const windowApi = window as any;
    windowApi.__focusInteractions = await windowApi.__focusTestHelpers
      .setup(windowApi.FocusInteractionsTest, xml);
  });

  await page.evaluate(() => {
    const state = (window as any).__focusInteractions;
    const element = state.modeler.get('elementRegistry').get('node-component');
    state.modeler.get('directEditing').activate(element);
  });

  const focusResult = await page.evaluate(() => {
    const windowApi = window as any;
    return windowApi.__focusTestHelpers.focusJourney(windowApi.__focusInteractions);
  });

  const cleanupResult = await page.evaluate(() => {
    const windowApi = window as any;
    return windowApi.__focusTestHelpers.cleanupJourney(windowApi.__focusInteractions);
  });
  const setupResult = await page.evaluate(() => {
    const state = (window as any).__focusInteractions;
    return {
      diagramTargetId: state.diagramTargetId,
      expectedRetainedListeners: state.expectedRetainedListeners,
      controlsAreDistinct: state.controlsAreDistinct,
      negativeControlsRemoved: state.negativeControlsRemoved
    };
  });
  const result = { ...setupResult, ...focusResult, ...cleanupResult };

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
  assert.equal(result.detachedSvgUnreachable, true);
  assert.equal(result.controlsAreDistinct, true);
  assert.equal(result.negativeControlsRemoved, true);
  assert.ok(result.listenerCountBeforeDestroy > 0);
  const retained = result.retainedListeners as Array<{
    targetId: string; type: string; listenerId: number; capture: boolean; count: number;
    registrationOrigin: string;
  }>;
  assert.match(result.diagramTargetId, /^svg#\d+$/);
  assert.deepEqual(
    retained.sort((left, right) => left.listenerId - right.listenerId),
    result.expectedRetainedListeners
  );
  assert.deepEqual(offOriginRequests, []);
  assert.deepEqual(browserRequests.every((url) => url === origin || url.startsWith(origin + '/')), true);
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
