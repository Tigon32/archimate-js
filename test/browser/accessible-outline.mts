// SYNTHETIC: Uses the repository read-only example and an escaped synthetic label.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

interface OutlineNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: OutlineNode[];
}

interface OutlineRelationship {
  id: string;
  type: string;
  name: string;
  sourceNodeId?: string;
  targetNodeId?: string;
}

interface OutlineData {
  nodes: Array<OutlineNode & { type: string; name: string }>;
  relationships: OutlineRelationship[];
}

interface BrowserDtoApi {
  importMeffToModelDto(xml: unknown): unknown;
  createAccessibleOutline(model: unknown, viewId: string, options: {
    grouping: 'containment'; includeRelationships: boolean; includeDocumentation: boolean;
  }): OutlineData;
}

declare global {
  interface Window { ArchimateModelDto?: BrowserDtoApi }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = 'test/fixtures/synthetic/read-only-showcase.xml';
const outlineFixturePath = 'test/fixtures/synthetic/read-only-showcase-outline-meff.xml';
const routes = new Map<string, string>([
  ['/examples/read-only/', 'examples/read-only/index.html'],
  ['/examples/read-only/viewer.js', 'examples/read-only/viewer.js'],
  ['/examples/read-only/theme.js', 'examples/read-only/theme.js'],
  ['/examples/read-only/diagram.css', 'examples/read-only/diagram.css'],
  ['/.ci-build/archimate-js.js', '.ci-build/archimate-js.js'],
  ['/.ci-build/model-dto.js', '.ci-build/model-dto.js'],
  ['/assets/design-tokens/app-shell.css', 'assets/design-tokens/app-shell.css'],
  ['/assets/design-tokens/app.generated.css', 'assets/design-tokens/app.generated.css'],
  ['/assets/ibm-plex-font/IBMPlexSans-Regular.ttf', 'assets/ibm-plex-font/IBMPlexSans-Regular.ttf'],
  ['/assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', 'assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf'],
  ['/node_modules/diagram-js/assets/diagram-js.css', 'node_modules/diagram-js/assets/diagram-js.css']
]);

const fixture = (await readFile(path.join(root, outlineFixturePath), 'utf8')).replace(
  '<name xml:lang="en">Customer</name>',
  '<name xml:lang="en">&lt;img src=x onerror=alert(1)&gt;</name>');
const legacyFixture = await readFile(path.join(root, fixturePath), 'utf8');
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === `/${fixturePath}` || pathname === `/${outlineFixturePath}`) {
    response.setHeader('content-type', 'application/xml; charset=utf-8');
    response.end(pathname === `/${fixturePath}` ? legacyFixture : fixture);
    return;
  }
  const file = routes.get(pathname);
  if (!file) { response.writeHead(404).end(); return; }
  const contentType = file.endsWith('.html') ? 'text/html; charset=utf-8' :
    file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.ttf') ? 'font/ttf' :
      'text/javascript; charset=utf-8';
  response.setHeader('content-type', contentType);
  createReadStream(path.join(root, file)).pipe(response);
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser test server did not bind a TCP port.');

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let dialogs = 0;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('dialog', (dialog) => { dialogs++; void dialog.dismiss(); });
  await page.goto(`http://127.0.0.1:${address.port}/examples/read-only/`, { waitUntil: 'networkidle' });
  await page.locator('#status[data-state="success"]').waitFor();
  await page.locator('#outline-status').getByText('Loaded the supported synthetic MEFF view outline.').waitFor();

  const list = page.locator('#outline-content > ul');
  assert.equal(await list.count(), 1, 'the selected view should render as a semantic list');
  assert.equal(await list.locator(':scope > li').count(), 5, 'the outline should include every view node');
  assert.ok((await page.locator('#outline-relationships li').count()) >= 4,
    'the outline should describe the selected view relationships');
  assert.ok((await page.locator('#outline-relationships').textContent())?.includes('from'));
  assert.equal(await page.locator('#outline-content img').count(), 0,
    'model-derived text must not create HTML elements');
  assert.ok((await page.locator('#outline-content').textContent())?.includes('<img src=x onerror=alert(1)>'));

  const nested = await page.evaluate(async () => {
    const api = window.ArchimateModelDto;
    if (!api) throw new Error('Model DTO browser API is unavailable.');
    const xml = await (await fetch('/test/fixtures/synthetic/read-only-showcase-outline-meff.xml')).text();
    const model = api.importMeffToModelDto(xml) as {
      views: Array<{ id: string; nodes: OutlineNode[]; connections: unknown[] }>;
    };
    const view = model.views.find((candidate) => candidate.id === 'view-synthetic-showcase');
    if (!view) throw new Error('Synthetic view is unavailable.');
    const children = view.nodes;
    view.nodes = [{ id: 'synthetic-outline-group', kind: 'container', x: 0, y: 0,
      width: 1200, height: 600, nodes: children }];
    const outline = api.createAccessibleOutline(model, view.id, {
      grouping: 'containment', includeRelationships: true, includeDocumentation: false
    });
    const host = document.createElement('div');
    host.id = 'nested-outline-test';
    const elements = document.createElement('div');
    elements.id = 'nested-outline-elements';
    const relations = document.createElement('div');
    // @ts-expect-error The browser test server exposes the emitted module URL.
    const renderer = await import('/examples/read-only/viewer.js');
    renderer.renderAccessibleOutline(outline, elements, relations);
    host.append(elements, relations);
    document.body.append(host);
    return { type: outline.nodes[0].type, nestedItems: elements.querySelectorAll('ul ul > li').length,
      details: elements.querySelectorAll('details').length,
      hasTreeRole: elements.querySelector('[role="tree"], [role="treeitem"]') !== null };
  });
  assert.equal(nested.type, 'Group');
  assert.equal(nested.nestedItems, 5, 'container children should become a nested semantic list');
  assert.equal(nested.details, 1, 'groups should use one native disclosure control');
  assert.equal(nested.hasTreeRole, false, 'the outline should keep native list semantics');

  const summary = page.locator('#nested-outline-test details > summary');
  await summary.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#nested-outline-test details').getAttribute('open'), null,
    'Space should activate the native disclosure control');
  await page.keyboard.press('Enter');
  assert.notEqual(await page.locator('#nested-outline-test details').getAttribute('open'), null,
    'Enter should activate the native disclosure control');
  assert.equal(dialogs, 0, 'synthetic hostile-looking text must not execute');
  console.log('Accessible outline Chromium checks passed.');
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
