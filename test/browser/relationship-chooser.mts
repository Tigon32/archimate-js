// SYNTHETIC: Exercises the public chooser and live connect-end adapter with the checked-in DTO fixture.
// @ts-expect-error Node types are excluded from the browser test project.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are excluded from the browser test project.
import { createReadStream, writeFileSync, unlinkSync } from 'node:fs';
// @ts-expect-error Node types are excluded from the browser test project.
import { createServer } from 'node:http';
// @ts-expect-error Node types are excluded from the browser test project.
import path from 'node:path';
// @ts-expect-error Node types are excluded from the browser test project.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/relationship-chooser-entry.generated.js');
writeFileSync(entryPath, `
  import Modeler, { RelationshipChooser, evaluateRelationshipChoices } from '../../dist/modeler/index.js';
  Object.assign(window, { RelationshipChooserTest: { Modeler, RelationshipChooser, evaluateRelationshipChoices } });
`);
try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: path.join(root, '.ci-build', 'relationship-chooser'), filename: 'test.js' },
    resolve: { extensions: ['.ts', '.js', '.json'] }, stats: 'errors-warnings' });
  const stats = await new Promise<import('webpack').Stats>((resolve, reject) => {
    compiler.run((error, result) => compiler.close((closeError) => {
      if (error || closeError || !result) reject(error || closeError || new Error('Browser compile failed.'));
      else resolve(result);
    }));
  });
  assert.equal(stats.hasErrors(), false);
} finally {
  unlinkSync(entryPath);
}

const files = new Map([
  ['/.ci-build/relationship-chooser/test.js', '.ci-build/relationship-chooser/test.js'],
  ['/synthetic.xml', 'test/fixtures/synthetic/dto-export-view.xml']
]);
const server = createServer((request: { url?: string }, response: {
  writeHead(status: number): { end(body?: string): void };
  setHeader(name: string, value: string): void;
}) => {
  const route = new URL(request.url || '/', 'http://localhost').pathname;
  if (route === '/') return void response.writeHead(200).end('<!doctype html><html><body></body></html>');
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
  await page.addScriptTag({ url: '/.ci-build/relationship-chooser/test.js' });
  const result = await page.evaluate(async () => {
    const api = (window as any).RelationshipChooserTest;
    const host = document.createElement('div');
    Object.assign(host.style, { width: '800px', height: '500px' });
    document.body.append(host);
    const modeler = new api.Modeler({ container: host, width: 800, height: 500 });
    await modeler.open(await (await fetch('/synthetic.xml')).text(), { viewId: 'view-dto-export' });
    const choice = api.evaluateRelationshipChoices('SyntheticSource', 'SyntheticTarget',
      ['Flow', 'Serving'], ({ relationshipType }: any) => ({
        archimateVersion: '3.2',
        decision: relationshipType === 'Flow' ? 'allowed' : 'unsupported',
        reasonCode: relationshipType === 'Flow' ? 'MATRIX_ALLOWED' : 'COMBINATION_UNSUPPORTED'
      }));
    let selected = '';
    const chooser = new api.RelationshipChooser({
      choice,
      returnFocus: host.querySelector('svg'),
      onChoose: (candidate: any) => { selected = candidate.type; }
    });
    const dialog = document.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector('input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const engine = modeler.getEngineCapabilities('diagram-js');
    const registry = engine.get('elementRegistry');
    const eventBus = engine.get('eventBus');
    const before = modeler.save().dtoJson;
    eventBus.fire('connect.end', {
      context: { source: registry.get('node-component'), target: registry.get('node-service'),
        canExecute: { type: 'Relationship' } }, x: 200, y: 150
    });
    const unsupportedStatus = document.querySelector('[role="status"]')?.textContent || '';
    const after = modeler.save().dtoJson;
    chooser.close(false);
    modeler.destroy();
    return { selected, unsupportedStatus, unchanged: before === after };
  });
  assert.deepEqual(result, {
    selected: 'Flow',
    unsupportedStatus: '0 known disallowed; 6 unsupported for this direction',
    unchanged: true
  });
  console.log('relationship chooser browser flow passed');
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
