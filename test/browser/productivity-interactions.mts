// SYNTHETIC: Browser flow uses the checked-in public-safe DTO MEFF fixture.
// @ts-expect-error Node types are excluded from the browser source project.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are excluded from the browser source project.
import { createReadStream } from 'node:fs';
// @ts-expect-error Node types are excluded from the browser source project.
import { unlink, writeFile } from 'node:fs/promises';
// @ts-expect-error Node types are excluded from the browser source project.
import { createServer } from 'node:http';
// @ts-expect-error Node types are excluded from the browser source project.
import path from 'node:path';
// @ts-expect-error Node types are excluded from the browser source project.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/productivity-interactions-entry.generated.js');
await writeFile(entryPath, `
  import Modeler from '../../dist/modeler/index.js';
  Object.assign(window, { ProductivityTest: { Modeler } });
`);
try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: path.join(root, '.ci-build/productivity'), filename: 'productivity-test.js' },
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
  ['/.ci-build/productivity/productivity-test.js', '.ci-build/productivity/productivity-test.js'],
  ['/synthetic.xml', 'test/fixtures/synthetic/dto-export-view.xml'],
  ['/diagram.css', 'node_modules/diagram-js/assets/diagram-js.css']
]);
const server = createServer((request: { url?: string }, response: {
  writeHead(status: number): { end(body?: string): void }; setHeader(name: string, value: string): void;
}) => {
  const route = new URL(request.url || '/', 'http://localhost').pathname;
  if (route === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    return void response.writeHead(200).end('<!doctype html><html><body></body></html>');
  }
  const file = files.get(route);
  if (!file) return void response.writeHead(404).end();
  response.setHeader('content-type', file.endsWith('.xml') ? 'application/xml' :
    file.endsWith('.css') ? 'text/css' : 'text/javascript');
  createReadStream(path.join(root, file)).pipe(response);
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(origin);
  await page.addStyleTag({ url: '/diagram.css' });
  await page.addScriptTag({ url: '/.ci-build/productivity/productivity-test.js' });
  const initial = await page.evaluate(async () => {
    const { Modeler } = (window as any).ProductivityTest;
    const host = document.createElement('div');
    Object.assign(host.style, { width: '800px', height: '500px', position: 'relative' });
    document.body.append(host);
    const modeler = new Modeler({ container: host, width: 800, height: 500 });
    await modeler.open(await (await fetch('/synthetic.xml')).text(), { viewId: 'view-dto-export' });
    const capabilities = modeler.getEngineCapabilities('diagram-js');
    capabilities.get('canvas').viewbox({ x: 0, y: 0, width: 800, height: 500 });
    modeler.execute({ type: 'move', viewId: 'view-dto-export',
      nodeId: 'node-service', x: 300, y: 180 });
    modeler.select(['node-component']);
    Object.assign(window, { productivityModeler: modeler, productivityHost: host });
    return {
      toolbar: Boolean(host.querySelector('[role="toolbar"]')),
      toolbarVisible: !(host.querySelector<HTMLElement>('[role="toolbar"]')?.hidden),
      contextConnector: Boolean(host.querySelector('.archimate-relation-multi'))
    };
  });
  assert.deepEqual(initial, { toolbar: true, toolbarVisible: true, contextConnector: true });

  await page.getByRole('button', { name: 'Duplicate' }).click();
  const duplicate = await page.evaluate(() => {
    const modeler = (window as any).productivityModeler;
    const model = JSON.parse(modeler.save().dtoJson);
    const selected = modeler.getSelection();
    const node = model.views[0].nodes.find((item: any) => item.id === selected[0]);
    return { elements: model.elements.length, selected: selected.length, x: node?.x, y: node?.y };
  });
  assert.deepEqual(duplicate, { elements: 4, selected: 2, x: 40, y: 60 });

  await page.evaluate(() => {
    const modeler = (window as any).productivityModeler;
    modeler.select(['node-component', 'node-service']);
  });
  await page.getByRole('button', { name: 'Align top' }).click();
  const aligned = await page.evaluate(() => {
    const nodes = (window as any).productivityModeler.project().nodes
      .filter((node: any) => ['node-component', 'node-service'].includes(node.id));
    return nodes.map((node: any) => node.y);
  });
  assert.deepEqual(aligned, [40, 40]);

  const altDuplicate = await page.evaluate(() => {
    const modeler = (window as any).productivityModeler;
    modeler.select(['node-service']);
    const capabilities = modeler.getEngineCapabilities('diagram-js');
    const shape = capabilities.get('elementRegistry').get('node-service');
    const target = capabilities.get('canvas').getGraphics(shape).querySelector('.djs-hit');
    const mouse = (type: string, x: number, y: number) => ({
      type, target, clientX: x, clientY: y, button: 0, altKey: true,
      preventDefault() {}, stopPropagation() {}
    });
    capabilities.get('move').start(mouse('mousedown', 370, 75), shape, true);
    capabilities.get('dragging').move(mouse('mousemove', 460, 145));
    capabilities.get('dragging').end(mouse('mouseup', 460, 145));
    const projection = modeler.project();
    const original = projection.nodes.find((node: any) => node.id === 'node-service');
    const selection = modeler.getSelection();
    const selected = projection.nodes.find((node: any) => node.id === selection[0]);
    return { original: [original.x, original.y],
      selected: selected ? [selected.x, selected.y] : undefined, selection,
      elementCount: JSON.parse(modeler.save().dtoJson).elements.length };
  });
  assert.deepEqual(altDuplicate, { original: [300, 40], selected: [390, 110],
    selection: [altDuplicate.selection[0]], elementCount: 5 });

  const reversible = await page.evaluate(() => {
    const modeler = (window as any).productivityModeler;
    const beforeUndo = modeler.save().dtoJson;
    const undo = modeler.undo();
    const afterUndo = modeler.save().dtoJson;
    const redo = modeler.redo();
    const afterRedo = modeler.save().dtoJson;
    return { undo, redo, changed: beforeUndo !== afterUndo, restored: beforeUndo === afterRedo };
  });
  assert.deepEqual(reversible, { undo: true, redo: true, changed: true, restored: true });
  const releasedModifier = await page.evaluate(() => {
    const modeler = (window as any).productivityModeler;
    const capabilities = modeler.getEngineCapabilities('diagram-js');
    const eventBus = capabilities.get('eventBus');
    const shape = capabilities.get('elementRegistry').get('node-service');
    const before = JSON.parse(modeler.save().dtoJson).elements.length;
    const end = () => eventBus.fire('shape.move.end', {
      context: { shapes: [shape], delta: { x: 30, y: 20 }, canExecute: false },
      originalEvent: { altKey: false }
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
    end();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    window.dispatchEvent(new Event('blur'));
    end();
    return { before, after: JSON.parse(modeler.save().dtoJson).elements.length };
  });
  assert.deepEqual(releasedModifier, { before: 5, after: 5 });
  await page.evaluate((id) => (window as any).productivityModeler.select([id]),
    altDuplicate.selection[0]);
  await page.getByRole('button', { name: 'Delete selection' }).click();
  const deletion = await page.evaluate(() => {
    const modeler = (window as any).productivityModeler;
    const afterDelete = modeler.project().nodes.length;
    const undo = modeler.undo();
    const afterUndo = modeler.project().nodes.length;
    modeler.destroy();
    (window as any).productivityHost.remove();
    return { afterDelete, undo, afterUndo };
  });
  assert.deepEqual(deletion, { afterDelete: 5, undo: true, afterUndo: 6 });
  console.log('productivity interaction browser flow passed');
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
