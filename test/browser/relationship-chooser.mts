// SYNTHETIC: This browser regression uses the checked-in synthetic MEFF fixture.
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
const entryPath = path.join(root, 'test/browser/relationship-chooser-entry.generated.js');
const outputPath = path.join(root, '.ci-build/relationship-chooser');
await writeFile(entryPath, `
  import Modeler from '../../dist/modeler/index.js';
  import { importMeffToModelDto } from '../../dist/model-dto/index.js';
  Object.assign(window, { RelationshipChooserTest: { Modeler, importMeffToModelDto } });
`);
try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: outputPath, filename: 'relationship-chooser-test.js' },
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
  ['/.ci-build/relationship-chooser/relationship-chooser-test.js',
    '.ci-build/relationship-chooser/relationship-chooser-test.js'],
  ['/synthetic.xml', 'test/fixtures/synthetic/dto-export-view.xml']
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
  response.setHeader('content-type', file.endsWith('.xml') ? 'application/xml' : 'text/javascript');
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
  await page.addScriptTag({ url: '/.ci-build/relationship-chooser/relationship-chooser-test.js' });
  await page.evaluate(async () => {
    const api = (window as any).RelationshipChooserTest;
    const source = await (await fetch('/synthetic.xml')).text();
    const xml = source
      .replace('xsi:type="archimate:ApplicationComponent"', 'xsi:type="archimate:ApplicationProcess"')
      .replace('xsi:type="archimate:ApplicationService"', 'xsi:type="archimate:ApplicationProcess"')
      .replace('xsi:type="archimate:Serving"', 'xsi:type="archimate:Flow"');
    const host = document.createElement('div');
    Object.assign(host.style, { width: '800px', height: '500px' });
    document.body.append(host);
    const modeler = new api.Modeler({ container: host, width: 800, height: 500 });
    const opened = await modeler.open(xml, { viewId: 'view-dto-export' });
    if (!opened.eligible) throw new Error('Synthetic relationship fixture is not DTO editable.');
    const capabilities = modeler.getEngineCapabilities('diagram-js');
    const modeling = capabilities.get('modeling');
    const registry = capabilities.get('elementRegistry');
    (window as any).relationshipChooserModeler = modeler;
    (window as any).relationshipChooserBefore = modeler.save().dtoJson;
    modeling.createConnection(registry.get('node-component'), registry.get('node-service'), {
      id: 'chooser-browser-connection',
      type: 'Relationship',
      waypoints: [{ x: 160, y: 75 }, { x: 300, y: 75 }]
    });
  });
  const dialog = page.getByRole('dialog', { name: 'Choose relationship' });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('option').count(), 2);
  await dialog.getByRole('option', { name: 'Flow' }).click();
  const quickCreateDialog = page.getByRole('dialog', { name: 'Create connected concept' });
  const quickCreateTarget = await page.evaluate(() => {
    const modeler = (window as any).relationshipChooserModeler;
    const capabilities = modeler.getEngineCapabilities('diagram-js');
    const canvas = capabilities.get('canvas');
    const registry = capabilities.get('elementRegistry');
    const svg = canvas.getContainer().querySelector('svg');
    const bounds = svg.getBoundingClientRect();
    const viewbox = canvas.viewbox();
    const start = registry.get('node-component');
    const startPoint = {
      x: bounds.left + (start.x + start.width / 2 - viewbox.x) * viewbox.scale,
      y: bounds.top + (start.y + start.height / 2 - viewbox.y) * viewbox.scale
    };
    const target = { x: bounds.left + (520 - viewbox.x) * viewbox.scale,
      y: bounds.top + (230 - viewbox.y) * viewbox.scale };
    capabilities.get('connect').start(new MouseEvent('mousedown', {
      bubbles: true, clientX: startPoint.x, clientY: startPoint.y
    }), start);
    return target;
  });
  await page.mouse.move(quickCreateTarget.x, quickCreateTarget.y, { steps: 5 });
  await page.mouse.up();
  await quickCreateDialog.waitFor({ timeout: 3000 });
  const beforeQuickCreate = await page.evaluate(() => {
    const value = (window as any).relationshipChooserModeler.save().dtoJson;
    (window as any).relationshipChooserBeforeQuickCreate = value;
    return value;
  });
  await quickCreateDialog.getByRole('searchbox', { name: 'Search compatible concepts' }).press('Escape');
  const canceledState = await page.evaluate(() =>
    (window as any).relationshipChooserModeler.save().dtoJson);
  assert.equal(canceledState, beforeQuickCreate, 'cancel must not leave an unconnected concept');

  const secondQuickCreateTarget = await page.evaluate(() => {
    const modeler = (window as any).relationshipChooserModeler;
    const capabilities = modeler.getEngineCapabilities('diagram-js');
    const canvas = capabilities.get('canvas');
    const registry = capabilities.get('elementRegistry');
    const svg = canvas.getContainer().querySelector('svg');
    const bounds = svg.getBoundingClientRect();
    const viewbox = canvas.viewbox();
    const start = registry.get('node-component');
    const startPoint = {
      x: bounds.left + (start.x + start.width / 2 - viewbox.x) * viewbox.scale,
      y: bounds.top + (start.y + start.height / 2 - viewbox.y) * viewbox.scale
    };
    const target = { x: bounds.left + (520 - viewbox.x) * viewbox.scale,
      y: bounds.top + (230 - viewbox.y) * viewbox.scale };
    capabilities.get('connect').start(new MouseEvent('mousedown', {
      bubbles: true, clientX: startPoint.x, clientY: startPoint.y
    }), start);
    return target;
  });
  await page.mouse.move(secondQuickCreateTarget.x, secondQuickCreateTarget.y, { steps: 5 });
  await page.mouse.up();
  await quickCreateDialog.waitFor({ timeout: 3000 });
  await quickCreateDialog.getByRole('searchbox', { name: 'Search compatible concepts' })
    .fill('ApplicationProcess');
  await quickCreateDialog.getByRole('option', {
    name: 'Application Process (Application) — Flow'
  }).click();
  const directEditor = page.locator('.djs-direct-editing-content');
  await directEditor.waitFor();
  await directEditor.fill('Quick Created App Process');
  await directEditor.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.djs-direct-editing-content'));
  const result = await page.evaluate(() => {
    const modeler = (window as any).relationshipChooserModeler;
    const beforeQuickCreate = JSON.parse((window as any).relationshipChooserBeforeQuickCreate);
    const saved = modeler.save();
    const dto = JSON.parse(saved.dtoJson);
    const createdConnection = dto.views[0].connections.find((item: any) =>
      item.id === 'chooser-browser-connection');
    const createdRelationship = dto.relationships.find((item: any) =>
      item.id === createdConnection?.relationshipId);
    const quickElement = dto.elements.find((item: any) => item.name === 'Quick Created App Process');
    const quickNode = dto.views[0].nodes.find((item: any) => item.elementId === quickElement?.id);
    const quickConnection = dto.views[0].connections.find((item: any) =>
      item.targetId === quickNode?.id);
    const quickRelationship = dto.relationships.find((item: any) =>
      item.id === quickConnection?.relationshipId);
    const committed = createdRelationship?.type === 'archimate:Flow' &&
      createdRelationship.sourceId === 'component-one' && createdRelationship.targetId === 'service-two';
    const quickCreated = quickElement?.type === 'archimate:ApplicationProcess' &&
      quickRelationship?.type === 'archimate:Flow' && quickRelationship.sourceId === 'component-one' &&
      quickRelationship.targetId === quickElement?.id && quickNode?.x === 450 && quickNode?.y === 195;
    const undoRename = modeler.undo();
    const undoQuickCreate = modeler.undo();
    const quickCreateReverted =
      JSON.stringify(JSON.parse(modeler.save().dtoJson)) === JSON.stringify(beforeQuickCreate);
    const undoRelationship = modeler.undo();
    const relationshipReverted =
      JSON.stringify(JSON.parse(modeler.save().dtoJson)) === JSON.stringify(JSON.parse(
        (window as any).relationshipChooserBefore));
    modeler.destroy();
    return { committed, quickCreated, undoRename, undoQuickCreate, quickCreateReverted,
      undoRelationship, relationshipReverted };
  });
  assert.deepEqual(result, { committed: true, quickCreated: true, undoRename: true,
    undoQuickCreate: true, quickCreateReverted: true, undoRelationship: true,
    relationshipReverted: true });
  console.log('relationship chooser browser flow passed');
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
