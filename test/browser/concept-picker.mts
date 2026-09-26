// SYNTHETIC: Browser flow uses the checked-in synthetic DTO MEFF fixture.
// @ts-expect-error Node types are excluded from the browser test project.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are excluded from the browser test project.
import { createReadStream } from 'node:fs';
// @ts-expect-error Node types are excluded from the browser test project.
import { unlink, writeFile } from 'node:fs/promises';
// @ts-expect-error Node types are excluded from the browser test project.
import { createServer } from 'node:http';
// @ts-expect-error Node types are excluded from the browser test project.
import path from 'node:path';
// @ts-expect-error Node types are excluded from the browser test project.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/concept-picker-entry.generated.js');

await writeFile(entryPath, `
  import Modeler from '../../dist/modeler/index.js';
  import { importMeffToModelDto } from '../../dist/model-dto/index.js';
  Object.assign(window, { ConceptPickerTest: { Modeler, importMeffToModelDto } });
`);
try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: path.join(root, '.ci-build', 'concept-picker'), filename: 'concept-picker-test.js' },
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
  ['/.ci-build/concept-picker/concept-picker-test.js', '.ci-build/concept-picker/concept-picker-test.js'],
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
  await page.addScriptTag({ url: '/.ci-build/concept-picker/concept-picker-test.js' });
  const pointer = await page.evaluate(async () => {
    const { Modeler } = (window as any).ConceptPickerTest;
    const host = document.createElement('div');
    Object.assign(host.style, { width: '800px', height: '500px' });
    document.body.append(host);
    const modeler = new Modeler({ container: host, width: 800, height: 500 });
    await modeler.open(await (await fetch('/synthetic.xml')).text(), { viewId: 'view-dto-export' });
    const canvas = modeler.getEngineCapabilities('diagram-js').get('canvas');
    canvas.viewbox({ x: 0, y: 0, width: 800, height: 500 });
    const svg = host.querySelector('svg')!;
    Object.assign(window, { conceptPickerModeler: modeler, conceptPickerHost: host });
    const registry = modeler.getEngineCapabilities('diagram-js').get('elementRegistry');
    canvas.getGraphics(registry.get('serving-connection')).dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true, cancelable: true, clientX: 300, clientY: 200
    }));
    const relationshipIgnored = !document.querySelector('[role="dialog"]');
    const bounds = svg.getBoundingClientRect();
    const pointer = { x: bounds.left + 650, y: bounds.top + 420 };
    const viewbox = canvas.viewbox(false);
    Object.assign(window, { conceptPickerExpected: {
      x: viewbox.x + (pointer.x - bounds.left) / viewbox.scale,
      y: viewbox.y + (pointer.y - bounds.top) / viewbox.scale
    } });
    return { ...pointer, relationshipIgnored };
  });
  assert.equal(pointer.relationshipIgnored, true,
    'double-clicking a relationship must not open the blank-canvas concept picker');
  await page.mouse.dblclick(pointer.x, pointer.y);
  const dialog = page.getByRole('dialog', { name: 'Create ArchiMate concept' });
  await dialog.waitFor();
  const search = dialog.getByRole('searchbox', { name: 'Search concepts' });
  await search.fill('Business Service');
  await dialog.getByRole('option', { name: 'Business Service (Business)' }).click();
  const directEditor = page.locator('.djs-direct-editing-content');
  await directEditor.waitFor();
  await directEditor.fill('Picker Created Service');
  await directEditor.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.djs-direct-editing-content'));
  const result = await page.evaluate(async () => {
    const { importMeffToModelDto } = (window as any).ConceptPickerTest;
    const modeler = (window as any).conceptPickerModeler;
    const beforeSave = modeler.save();
    const dto = importMeffToModelDto(beforeSave.xml);
    const created = dto.elements.find((element: any) => element.name === 'Picker Created Service');
    const node = dto.views[0].nodes.find((item: any) => item.elementId === created?.id);
    const replayHost = document.createElement('div');
    Object.assign(replayHost.style, { width: '800px', height: '500px' });
    document.body.append(replayHost);
    const roundtripModeler = new (modeler.constructor)({ container: replayHost, width: 800, height: 500 });
    await roundtripModeler.open(beforeSave.xml, { viewId: 'view-dto-export' });
    const roundtrip = roundtripModeler.save();
    const exactRoundtrip = JSON.stringify(importMeffToModelDto(roundtrip.xml)) ===
      JSON.stringify(JSON.parse(beforeSave.dtoJson));
    modeler.destroy();
    roundtripModeler.destroy();
    (window as any).conceptPickerHost.remove();
    replayHost.remove();
    return {
      created: Boolean(created),
      semanticName: created?.name,
      positionedAtPointer: Boolean(node && Math.abs(node.x - (window as any).conceptPickerExpected.x) < 1 &&
        Math.abs(node.y - (window as any).conceptPickerExpected.y) < 1),
      exactRoundtrip
    };
  });
  assert.equal(result.created, true);
  assert.equal(result.semanticName, 'Picker Created Service');
  assert.equal(result.positionedAtPointer, true);
  assert.equal(result.exactRoundtrip, true);
  console.log('concept picker browser flow passed');
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
