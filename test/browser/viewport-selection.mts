// SYNTHETIC: Browser assertions use the checked-in synthetic DTO MEFF fixture only.
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { createReadStream } from 'node:fs';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { writeFile, unlink } from 'node:fs/promises';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { createServer } from 'node:http';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import path from 'node:path';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/viewport-selection.generated.js');

await writeFile(entryPath, `
  import Modeler from '../../dist/modeler/index.js';
  Object.assign(window, { ViewportSelectionTest: { Modeler } });
`);

try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: path.join(root, '.ci-build'), filename: 'viewport-selection-test.js' },
    module: { rules: [{ test: /\\.(css|svg|ttf|woff2?)$/, type: 'asset/inline' }] },
    resolve: { extensions: ['.ts', '.js', '.json'] }, stats: 'errors-warnings' });
  const stats = await new Promise<import('webpack').Stats>((resolve, reject) => {
    compiler.run((error, result) => compiler.close((closeError) => {
      if (error || closeError || !result) reject(error || closeError || new Error('Browser compile failed.'));
      else resolve(result);
    }));
  });
  assert.equal(stats.hasErrors(), false, JSON.stringify(stats.toJson({ all: false, errors: true }).errors));
} finally {
  await unlink(entryPath);
}

const files = new Map([
  ['/.ci-build/viewport-selection-test.js', '.ci-build/viewport-selection-test.js'],
  ['/synthetic.xml', 'test/fixtures/synthetic/dto-export-view.xml'],
  ['/diagram.css', 'node_modules/diagram-js/assets/diagram-js.css']
]);
const scenarioScript = `
let viewportSelectionState;
window.__prepareViewportSelectionTest = async () => {
  const api = window.ViewportSelectionTest;
  const xml = await (await fetch('/synthetic.xml')).text();
  const container = document.createElement('div');
  Object.assign(container.style, { width: '800px', height: '500px' });
  document.body.append(container);
  const modeler = new api.Modeler({ container, width: 800, height: 500 });
  const viewportEvents = [];
  modeler.on('viewport', (event) => viewportEvents.push(JSON.parse(JSON.stringify(event))));
  await modeler.open(xml, { viewId: 'view-dto-export' });
  const engine = modeler.getEngineCapabilities('diagram-js');
  const canvas = engine.get('canvas');
  const selection = engine.get('selection');
  const registry = engine.get('elementRegistry');
  const svg = container.querySelector('svg');
  const delay = () => new Promise((resolve) => setTimeout(resolve, 20));
  const rect = () => svg.getBoundingClientRect();
  const point = (x, y) => ({ clientX: rect().left + x, clientY: rect().top + y });
  const mouse = (target, type, options = {}) => target.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 0,
    buttons: type === 'mousedown' ? 1 : 0, ...options
  }));
  const key = (type, value, options = {}) => svg.dispatchEvent(new KeyboardEvent(type, {
    key: value, bubbles: true, cancelable: true, ...options
  }));
  canvas.viewbox({ x: 0, y: 0, width: 800, height: 500 });
  svg.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  svg.focus();
  const beforeWheel = modeler.getZoom();
  svg.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true, cancelable: true, deltaY: -180, ctrlKey: true, ...point(350, 220)
  }));
  await delay();
  const wheelZoomed = modeler.getZoom() !== beforeWheel;
  const beforePinch = modeler.getZoom();
  svg.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true, cancelable: true, deltaY: 180, ctrlKey: true, ...point(350, 220)
  }));
  await delay();
  const pinchZoomed = modeler.getZoom() !== beforePinch;
  const beforePan = canvas.viewbox();
  svg.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true, cancelable: true, deltaX: 80, deltaY: 60, ...point(300, 200)
  }));
  await delay();
  const afterPan = canvas.viewbox();
  const wheelPanned = afterPan.x !== beforePan.x || afterPan.y !== beforePan.y;
  canvas.viewbox({ x: 0, y: 0, width: 800, height: 500 });
  mouse(svg, 'mousemove', point(300, 250));
  key('keydown', 'Space', { code: 'Space' });
  mouse(svg, 'mousedown', point(300, 250));
  mouse(document, 'mousemove', point(360, 300));
  mouse(document, 'mouseup', point(360, 300));
  key('keyup', 'Space', { code: 'Space' });
  await delay();
  const spaceDragPanned = canvas.viewbox().x !== 0 || canvas.viewbox().y !== 0;
  canvas.viewbox({ x: 0, y: 0, width: 800, height: 500 });
  selection.select(registry.get('node-component'));
  const target = canvas.getGraphics(registry.get('node-service'));
  const targetRect = target.getBoundingClientRect();
  const center = { clientX: targetRect.left + targetRect.width / 2,
    clientY: targetRect.top + targetRect.height / 2 };
  mouse(target, 'mousedown', { shiftKey: true, ...center });
  mouse(target, 'mouseup', { shiftKey: true, ...center });
  mouse(target, 'click', { shiftKey: true, ...center });
  await delay();
  const shiftIds = selection.get().map((element) => element.id).sort();
  selection.select(null);
  mouse(svg, 'mousedown', { shiftKey: true, ...point(0, 0) });
  mouse(document, 'mousemove', { shiftKey: true, ...point(500, 260) });
  mouse(document, 'mouseup', { shiftKey: true, ...point(500, 260) });
  await delay();
  const lassoIds = selection.get().map((element) => element.id).sort();
  viewportSelectionState = {
    modeler, viewportEvents, container, engine, canvas, selection, registry, svg,
    delay, wheelZoomed, pinchZoomed, wheelPanned, spaceDragPanned, lassoIds,
    shiftIds
  };
  return true;
};

window.__finishViewportSelectionTest = async () => {
  const { modeler, viewportEvents, container, engine, canvas, selection, registry, svg,
    delay, wheelZoomed, pinchZoomed, wheelPanned, spaceDragPanned, lassoIds, shiftIds } =
    viewportSelectionState;
  const key = (type, value, options = {}) => svg.dispatchEvent(new KeyboardEvent(type, {
    key: value, bubbles: true, cancelable: true, ...options
  }));
  key('keydown', 'Escape');
  await delay();
  const escapeCleared = selection.get().length === 0;
  key('keydown', 'a', { ctrlKey: true });
  await delay();
  const selectAllCount = selection.get().length;
  key('keydown', '0', { ctrlKey: true });
  await delay();
  const fitShortcutScale = modeler.getZoom();
  selection.select(registry.get('node-component'));
  key('keydown', '!', { shiftKey: true });
  await delay();
  const fitViewScale = modeler.getZoom();
  key('keydown', '@', { shiftKey: true });
  await delay();
  const fitSelectionChanged = modeler.getZoom() !== fitViewScale || canvas.viewbox().x !== 0;
  engine.get('directEditing').activate(registry.get('node-component'));
  const editor = container.querySelector('.djs-direct-editing-content');
  const beforeEditingViewport = canvas.viewbox();
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space', bubbles: true, cancelable: true }));
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await delay();
  const editingIgnoredShortcuts = canvas.viewbox().x === beforeEditingViewport.x &&
    canvas.viewbox().y === beforeEditingViewport.y;
  modeler.panBy(12, 24);
  const apiPanChanged = viewportEvents.length > 0;
  const plainViewport = viewportEvents.every((event) => {
    const keys = Object.keys(event).sort().join(',');
    return keys === 'scale,type,x,y' && event.type === 'viewport';
  });
  modeler.fitView();
  modeler.fitSelection();
  const facadeZoom = modeler.zoom(0.75);
  const facadeFit = modeler.zoom('fit');
  modeler.destroy();
  container.remove();
  return { wheelZoomed, pinchZoomed, wheelPanned, spaceDragPanned, lassoIds,
    shiftIds, escapeCleared, selectAllCount, fitShortcutScale, fitViewScale,
    fitSelectionChanged, editingIgnoredShortcuts, apiPanChanged, plainViewport,
    facadeZoom, facadeFit };
};
`;
const server = createServer((request: { url?: string }, response: {
  writeHead(status: number): { end(body?: string): void }; setHeader(name: string, value: string): void;
}) => {
  const route = new URL(request.url || '/', 'http://localhost').pathname;
  if (route === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    return void response.writeHead(200).end('<!doctype html><html><body></body></html>');
  }
  const name = files.get(route);
  if (!name) return void response.writeHead(404).end();
  response.setHeader('content-type', name.endsWith('.css') ? 'text/css' :
    name.endsWith('.xml') ? 'application/xml' : 'text/javascript');
  createReadStream(path.join(root, name)).pipe(response);
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(origin + '/');
  await page.addStyleTag({ url: '/diagram.css' });
  await page.addScriptTag({ url: '/.ci-build/viewport-selection-test.js' });
  await page.addScriptTag({ content: scenarioScript });
  await page.evaluate(() => (window as any).__prepareViewportSelectionTest());
  const result = await page.evaluate(() => (window as any).__finishViewportSelectionTest());
  console.log(JSON.stringify(result));
  assert.equal(result.wheelZoomed, true);
  assert.equal(result.pinchZoomed, true);
  assert.equal(result.wheelPanned, true);
  assert.equal(result.spaceDragPanned, true);
  assert.equal(result.lassoIds.length >= 2, true);
  assert.deepEqual(result.shiftIds, ['node-component', 'node-service']);
  assert.equal(result.escapeCleared, true);
  assert.equal(result.selectAllCount >= 3, true);
  assert.equal(typeof result.fitShortcutScale, 'number');
  assert.equal(typeof result.fitViewScale, 'number');
  assert.equal(result.fitSelectionChanged, true);
  assert.equal(result.editingIgnoredShortcuts, true);
  assert.equal(result.apiPanChanged, true);
  assert.equal(result.plainViewport, true);
  assert.equal(result.facadeZoom, 0.75);
  assert.equal(result.facadeFit, undefined);
  console.log('viewport and selection browser checks passed');
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
