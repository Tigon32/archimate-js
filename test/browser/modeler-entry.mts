// SYNTHETIC: Browser assertions use checked-in synthetic MEFF fixtures only.
// @ts-expect-error Node types are excluded from the browser source project.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are excluded from the browser source project.
import { createReadStream } from 'node:fs';
// @ts-expect-error Node types are excluded from the browser source project.
import { writeFile, unlink } from 'node:fs/promises';
// @ts-expect-error Node types are excluded from the browser source project.
import { createServer } from 'node:http';
// @ts-expect-error Node types are excluded from the browser source project.
import path from 'node:path';
// @ts-expect-error Node types are excluded from the browser source project.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/modeler-entry.generated.js');
await writeFile(entryPath, `
  import Modeler from '../../dist/modeler/index.js';
  import { importMeffToModelDto } from '../../dist/model-dto/index.js';
  Object.assign(window, { ModelerEntryTest: { Modeler, importMeffToModelDto } });
`);
try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: path.join(root, '.ci-build'), filename: 'modeler-entry-test.js' },
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
  ['/.ci-build/modeler-entry-test.js', '.ci-build/modeler-entry-test.js'],
  ['/supported.xml', 'test/fixtures/synthetic/dto-export-view.xml']
]);
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
  response.setHeader('content-type', name.endsWith('.xml') ? 'application/xml' : 'text/javascript');
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
  await page.addScriptTag({ url: '/.ci-build/modeler-entry-test.js' });
  const result = await page.evaluate(async () => {
    const api = (window as unknown as { ModelerEntryTest: Record<string, any> }).ModelerEntryTest;
    const xml = await (await fetch('/supported.xml')).text();
    const container = document.createElement('div');
    document.body.append(container);
    const modeler = new api.Modeler({ container, width: 640, height: 480 });
    const events: string[] = [];
    modeler.on('opened', (event: any) => events.push(`${event.type}:${event.eligible}`));
    modeler.on('changed', (event: any) => events.push(`${event.type}:${event.selectedIds.length}`));
    const opened = await modeler.open(xml, { viewId: 'view-dto-export' });
    const before = modeler.project().nodes.find((node: any) => node.id === 'node-component');
    modeler.execute({ type: 'move', viewId: 'view-dto-export', nodeId: 'node-component', x: 44, y: 52 });
    modeler.undo();
    modeler.redo();
    modeler.select(['node-component']);
    modeler.zoom('fit');
    const saved = modeler.save();
    const roundtrip = api.importMeffToModelDto(saved.xml);
    const after = modeler.project().nodes.find((node: any) => node.id === 'node-component');
    const selected = modeler.getSelection().join(',') === 'node-component';
    const same = JSON.stringify(roundtrip) === JSON.stringify(JSON.parse(saved.dtoJson));
    modeler.close();
    await modeler.open(saved.xml, { viewId: 'view-dto-export' });
    const reopened = modeler.project().nodes.find((node: any) => node.id === 'node-component');
    modeler.destroy();
    return { opened, moved: before.x !== after.x && after.x === 44 && after.y === 52,
      selected, same, reopened: reopened.x === 44, events };
  });
  assert.deepEqual(result, { opened: { eligible: true, reasons: [], viewId: 'view-dto-export' },
    moved: true, selected: true, same: true, reopened: true,
    events: ['opened:true', 'changed:0', 'changed:0', 'changed:0', 'opened:true'] });
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
