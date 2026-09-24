// SYNTHETIC: Browser assertions use checked-in synthetic MEFF fixtures only.
// @ts-expect-error Node types are excluded from the browser source project.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are excluded from the browser source project.
import { createReadStream } from 'node:fs';
// @ts-expect-error Node types are excluded from the browser source project.
import { copyFile, unlink } from 'node:fs/promises';
// @ts-expect-error Node types are excluded from the browser source project.
import { createServer } from 'node:http';
// @ts-expect-error Node types are excluded from the browser source project.
import path from 'node:path';
// @ts-expect-error Node types are excluded from the browser source project.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/dto-save-entry.generated.js');
await copyFile(path.join(root, 'test/browser/dto-save-entry.ts'), entryPath);
let stats: import('webpack').Stats;
try {
  const compiler = webpack({ mode: 'development', target: 'web',
    entry: entryPath,
    output: { path: path.join(root, '.ci-build'), filename: 'dto-save-test.js' },
    module: { rules: [{ test: /\.(css|svg|ttf|woff2?)$/, type: 'asset/inline' }] },
    resolve: { extensions: ['.js', '.json'] }, stats: 'errors-warnings' });
  stats = await new Promise<import('webpack').Stats>((resolve, reject) => {
    compiler.run((error, result) => compiler.close((closeError) => {
      if (error || closeError || !result) reject(error || closeError || new Error('Browser compile failed.'));
      else resolve(result);
    }));
  });
} finally {
  await unlink(entryPath);
}
assert.equal(stats.hasErrors(), false, JSON.stringify(stats.toJson({ all: false, errors: true }).errors));

const files = new Map([
  ['/.ci-build/dto-save-test.js', '.ci-build/dto-save-test.js'],
  ['/supported.xml', 'test/fixtures/synthetic/dto-export-view.xml'],
  ['/unsupported.xml', 'test/fixtures/meff-schema/valid-view-presentation.xml']
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
  const documentResponse = await fetch(origin + '/');
  assert.equal(documentResponse.status, 200, 'browser harness must serve its root document');
  assert.match(await documentResponse.text(), /<!doctype html>/i);
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(origin + '/');
  await page.addScriptTag({ url: '/.ci-build/dto-save-test.js' });
  const result = await page.evaluate(async () => {
    const api = (window as unknown as { DtoSaveTest: Record<string, any> }).DtoSaveTest;
    const supported = await (await fetch('/supported.xml')).text();
    const unsupported = await (await fetch('/unsupported.xml')).text();
    const container = document.createElement('div');
    document.body.append(container);
    const modeler = new api.Modeler({ container });
    const session = await api.DtoModelerSession.open(modeler, supported, 'view-dto-export');
    const original = session.editor.serialize();
    const modeling = modeler.get('modeling');
    const registry = modeler.get('elementRegistry');
    modeling.moveElements([registry.get('node-component')], { x: 12, y: -5 });
    modeling.resizeShape(registry.get('node-service'), { x: 210, y: 30, width: 150, height: 80 });
    modeling.updateLabel(registry.get('node-component'), 'Updated component');
    modeling.createConnection(registry.get('node-component'), registry.get('node-service'),
      { id: 'new-connection', type: 'Serving', waypoints: [
        { x: 160, y: 75 }, { x: 220, y: 90 }, { x: 300, y: 75 }
      ] });
    modeling.reconnectEnd(registry.get('new-connection'), registry.get('node-service-nested'),
      { x: 105, y: 175 });
    const beforeUndo = session.editor.serialize();
    session.editor.undo(); session.editor.undo();
    const undoChanged = session.editor.serialize() !== beforeUndo;
    session.editor.redo(); session.editor.redo();
    const saved = session.save();
    const roundtrip = api.importMeffToModelDto(saved.xml);
    const expected = session.editor.getModel();
    const same = JSON.stringify(roundtrip) === JSON.stringify(expected);
    const plain = saved.dtoJson === session.editor.serialize() &&
      !/businessObject|selectedIds|\$parent|\$type/.test(saved.dtoJson) &&
      !/businessObject|selectedIds/.test(saved.xml);
    session.close();
    const rejected = await api.DtoModelerSession.open(modeler, unsupported);
    const originalModel = modeler.getModel();
    const legacyXml = (await modeler.saveXML()).xml;
    let rejectedCode = '';
    try { rejected.save(); } catch (error: any) { rejectedCode = error.code; }
    const originalAvailable = rejected.eligible === false && originalModel === modeler.getModel() &&
      legacyXml.includes('identifier=') && rejectedCode === 'DTO_EDITING_INELIGIBLE';
    rejected.close();
    modeler.destroy();
    return { eligible: session.eligible, originalChanged: original !== saved.dtoJson,
      undoChanged, same, plain, originalAvailable, reasons: rejected.reasons.map((r: any) => r.code) };
  });
  assert.deepEqual(result, { eligible: true, originalChanged: true, undoChanged: true,
    same: true, plain: true, originalAvailable: true, reasons: ['DTO_UNSUPPORTED_FIELDS'] });
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
