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
  checkMeffEditingEligibility(xml: unknown): { eligible: boolean };
  importMeffToModelDto(xml: unknown): unknown;
  createAccessibleOutline(model: unknown, viewId: string, options: {
    grouping: 'containment'; includeRelationships: boolean; includeDocumentation: boolean;
  }): OutlineData;
  DtoModelerSession: {
    open(viewer: unknown, xml: string, viewId: string): Promise<{
      editor?: {
        project(viewId: string): { selectedIds: string[] };
        select(viewId: string, ids: string[]): void;
        subscribe(listener: (event: { type: 'changed' | 'selection'; viewId: string;
          selectedIds: string[] }) => void): () => void;
      };
      close(): void;
    }>;
  };
}

interface BrowserViewerApi {
  mountViewer(options: { xml: string; viewId: string; container: HTMLElement;
    width: string; height: string }): Promise<{
      on(event: string, callback: (event?: unknown) => void): void;
      off(event: string, callback: (event?: unknown) => void): void;
      openView(viewId: string): Promise<unknown>;
      destroy(): void;
    }>;
}

declare global {
  interface Window {
    ArchimateModelDto?: BrowserDtoApi;
    ArchimateJS?: BrowserViewerApi;
    adapterContract?: { viewer: Awaited<ReturnType<BrowserViewerApi['mountViewer']>>;
      selectById(id: string): boolean; registrations: Array<{ event: string; removed: boolean }>;
      getUnsubscribeCount(): number };
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = 'test/fixtures/synthetic/read-only-showcase-outline-meff.xml';
const adapterFixturePath = 'test/fixtures/synthetic/dto-export-view.xml';
const routes = new Map<string, string>([
  ['/examples/read-only/', 'examples/read-only/index.html'],
  ['/examples/read-only/viewer.js', 'examples/read-only/viewer.js'],
  ['/examples/read-only/outline-bridge.js', 'examples/read-only/outline-bridge.js'],
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

const fixture = (await readFile(path.join(root, fixturePath), 'utf8')).replace(
  '<name xml:lang="en">Customer</name>',
  '<name xml:lang="en">&lt;img src=x onerror=alert(1)&gt;</name>');
const adapterFixture = await readFile(path.join(root, adapterFixturePath), 'utf8');
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === `/${fixturePath}`) {
    response.setHeader('content-type', 'application/xml; charset=utf-8');
    response.end(fixture);
    return;
  }
  if (pathname === `/${adapterFixturePath}`) {
    response.setHeader('content-type', 'application/xml; charset=utf-8');
    response.end(adapterFixture);
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
  const browserRequests: string[] = [];
  const offOriginRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    browserRequests.push(url);
    if (url.startsWith(`http://127.0.0.1:${address.port}/`)) {
      await route.continue();
      return;
    }
    offOriginRequests.push(url);
    await route.abort();
  });
  page.on('dialog', (dialog) => { dialogs++; void dialog.dismiss(); });
  await page.goto(`http://127.0.0.1:${address.port}/examples/read-only/`, { waitUntil: 'networkidle' });
  await page.locator('#status[data-state="success"]').waitFor();
  await page.locator('#outline-status').getByText('Loaded the supported synthetic MEFF view outline.').waitFor();

  const companionRendersAsDiagram = await page.evaluate(async () => {
    const api = window.ArchimateJS;
    if (!api) return false;
    const xml = await (await fetch('/test/fixtures/synthetic/read-only-showcase-outline-meff.xml')).text();
    const host = document.createElement('div');
    document.body.append(host);
    try {
      const viewer = await api.mountViewer({ xml, viewId: 'view-synthetic-showcase',
        container: host, width: '800px', height: '500px' });
      viewer.destroy();
      return true;
    } catch {
      return false;
    } finally {
      host.remove();
    }
  });
  assert.equal(companionRendersAsDiagram, true,
    'the shared MEFF source should be mountable by both browser APIs');

  const list = page.locator('#outline-content > ul');
  assert.equal(await list.count(), 1, 'the selected view should render as a semantic list');
  assert.equal(await list.locator(':scope > li').count(), 5, 'the outline should include every view node');
  assert.ok((await page.locator('#outline-relationships li').count()) >= 4,
    'the outline should describe the selected view relationships');
  assert.equal(await page.getByRole('list', { name: 'Relationships', exact: true }).count(), 1,
    'the relationships list should have the accessible name of its visible heading');
  assert.ok((await page.locator('#outline-relationships').textContent())?.includes('from'));
  assert.equal(await page.locator('#outline-content img').count(), 0,
    'model-derived text must not create HTML elements');
  assert.ok((await page.locator('#outline-content').textContent())?.includes('<img src=x onerror=alert(1)>'));

  const firstPortal = page.locator('[data-outline-id="view-customer"]').first();
  await firstPortal.click();
  assert.equal(await firstPortal.getAttribute('aria-pressed'), 'true',
    'activating an outline item should select the same stable view node id');
  const outlineLabels = await page.locator('[data-outline-id]').filter({ hasText: /Customer|Request/ })
    .evaluateAll((buttons) => buttons.map((button) => button.textContent ?? ''));
  assert.ok(outlineLabels.every((label) => /id view-/.test(label)),
    'visible names should include stable id context for repeated-name disambiguation');
  await firstPortal.press('ArrowDown');
  assert.notEqual(await page.evaluate(() => document.activeElement?.getAttribute('data-outline-id')),
    'view-customer', 'ArrowDown should move focus through outline entries');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed')), 'true',
    'Enter should activate the focused outline entry');
  await page.locator('#outline-search').fill('platform');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-outline-id')),
    'view-platform', 'Enter in search should focus and activate the first matching stable id');
  await page.locator('#outline-search').fill('no synthetic match');
  assert.equal(await page.locator('#outline-search-status').textContent(), 'No outline matches.');

  const failureIsolation = await page.evaluate(async () => {
    // @ts-expect-error The browser test server exposes the emitted module URL.
    const renderer = await import('/examples/read-only/viewer.js');
    const existingApi = window.ArchimateJS;
    if (!existingApi) throw new Error('Viewer browser API is unavailable.');
    window.ArchimateJS = { mountViewer: async () => { throw new Error('synthetic render failure'); } };
    try {
      await renderer.renderExample();
      return {
        diagramError: document.querySelector('#status')?.getAttribute('data-state') === 'error',
        outlineReady: document.querySelector('#outline-status')?.textContent ===
          'Loaded the supported synthetic MEFF view outline.',
        outlinedNodes: document.querySelectorAll('#outline-content > ul > li').length
      };
    } finally {
      window.ArchimateJS = existingApi;
    }
  });
  assert.equal(failureIsolation.diagramError, true, 'diagram failure should keep its own error status');
  assert.equal(failureIsolation.outlineReady, true, 'diagram failure should not suppress the outline');
  assert.equal(failureIsolation.outlinedNodes, 5, 'the outline should use the shared fetched model');

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

  const bridgeContract = await page.evaluate(async () => {
    const api = window.ArchimateJS;
    const dto = window.ArchimateModelDto;
    if (!api || !dto) throw new Error('Browser APIs are unavailable.');
    const xml = await (await fetch('/test/fixtures/synthetic/dto-export-view.xml')).text();
    if (!dto.checkMeffEditingEligibility(xml).eligible) throw new Error('DTO contract fixture must be eligible.');
    const host = document.createElement('div');
    host.id = 'adapter-contract-host';
    host.style.cssText = 'width:800px;height:500px;';
    document.body.append(host);
    const viewer = await api.mountViewer({ xml, viewId: 'view-dto-export',
      container: host, width: '800px', height: '500px' });
    const session = await dto.DtoModelerSession.open(viewer, xml, 'view-dto-export');
    if (!session.editor) throw new Error('Eligible DTO session did not expose an editor.');
    let unsubscribeCount = 0;
    const originalSubscribe = session.editor.subscribe.bind(session.editor);
    session.editor.subscribe = (listener) => {
      const unsubscribe = originalSubscribe(listener);
      return () => { unsubscribeCount++; unsubscribe(); };
    };
    const registrations: Array<{ event: string; removed: boolean }> = [];
    const originalOn = viewer.on.bind(viewer);
    const originalOff = viewer.off.bind(viewer);
    viewer.on = (event, callback) => {
      registrations.push({ event, removed: false });
      originalOn(event, callback);
    };
    viewer.off = (event, callback) => {
      const match = registrations.find((entry) => entry.event === event && !entry.removed);
      if (match) match.removed = true;
      originalOff(event, callback);
    };
    const outlineSelection = document.createElement('output');
    outlineSelection.id = 'adapter-contract-selection';
    host.append(outlineSelection);
    // @ts-expect-error The browser test server exposes the emitted module URL.
    const renderer = await import('/examples/read-only/viewer.js');
    // @ts-expect-error The browser test server exposes the emitted module URL.
    const bridge = await import('/examples/read-only/outline-bridge.js');
    const adapter = bridge.createDiagramAdapterSelectionBridge(session.editor, 'view-dto-export');
    adapter.onSelectionChange((ids: string[]) => { outlineSelection.value = ids.join(','); });
    renderer.bindViewerSelection(viewer, session, adapter);
    const selected = adapter.selectById('node-component');
    const canvasSelected = host.querySelector('.djs-element[data-element-id="node-component"]')
      ?.classList.contains('selected');
    window.adapterContract = { viewer, selectById: (id) => adapter.selectById(id), registrations,
      getUnsubscribeCount: () => unsubscribeCount };
    return { selected, canvasSelected, outlineSelection: outlineSelection.value };
  });
  assert.equal(bridgeContract.selected, true,
    'outline activation should call the adapter with a stable view-node ID');
  assert.equal(bridgeContract.canvasSelected, true,
    'the adapter should route the ID selection to its attached canvas port');
  assert.equal(bridgeContract.outlineSelection, 'node-component',
    'the adapter EditorEvent should publish selectedIds to the outline');
  await page.locator('#adapter-contract-host .djs-element[data-element-id="node-service"]').click({ force: true });
  assert.equal(await page.locator('#adapter-contract-selection').textContent(), 'node-service',
    'canvas selection should update the outline through EditorEvent selectedIds');
  const viewChangeCleanup = await page.evaluate(async () => {
    const contract = window.adapterContract;
    const dto = window.ArchimateModelDto;
    if (!contract || !dto) throw new Error('Adapter contract fixture is unavailable.');
    await contract.viewer.openView('view-dto-export');
    const viewChange = { selectedAfterViewChange: contract.selectById('node-component'),
      registrations: contract.registrations.map((entry) => ({ ...entry })),
      unsubscribeCount: contract.getUnsubscribeCount() };
    const xml = await (await fetch('/test/fixtures/synthetic/dto-export-view.xml')).text();
    const session = await dto.DtoModelerSession.open(contract.viewer, xml, 'view-dto-export');
    if (!session.editor) throw new Error('Eligible DTO session did not reopen after view change.');
    let destroyUnsubscribeCount = 0;
    const originalSubscribe = session.editor.subscribe.bind(session.editor);
    session.editor.subscribe = (listener) => {
      const unsubscribe = originalSubscribe(listener);
      return () => { destroyUnsubscribeCount++; unsubscribe(); };
    };
    // @ts-expect-error The browser test server exposes the emitted module URL.
    const bridgeModule = await import('/examples/read-only/outline-bridge.js');
    // @ts-expect-error The browser test server exposes the emitted module URL.
    const renderer = await import('/examples/read-only/viewer.js');
    const destroyAdapter = bridgeModule.createDiagramAdapterSelectionBridge(session.editor, 'view-dto-export');
    const destroyListenerOffset = contract.registrations.length;
    renderer.bindViewerSelection(contract.viewer, session, destroyAdapter);
    contract.viewer.destroy();
    return { viewChange, destroy: { unsubscribeCount: destroyUnsubscribeCount,
      selectAfterDestroy: destroyAdapter.selectById('node-component'),
      registrations: contract.registrations.slice(destroyListenerOffset) } };
  });
  assert.equal(viewChangeCleanup.viewChange.selectedAfterViewChange, false,
    'view change should dispose the active view selection bridge');
  assert.equal(viewChangeCleanup.viewChange.unsubscribeCount, 1,
    'view change should unsubscribe the EditorEvent listener');
  assert.deepEqual(viewChangeCleanup.viewChange.registrations, [
    { event: 'import.render.start', removed: true },
    { event: 'diagram.destroy', removed: true }
  ], 'view change should remove lifecycle hooks');
  assert.deepEqual(viewChangeCleanup.destroy.registrations, [
    { event: 'import.render.start', removed: true },
    { event: 'diagram.destroy', removed: true }
  ], 'destroy should remove lifecycle hooks');
  assert.equal(viewChangeCleanup.destroy.unsubscribeCount, 1,
    'destroy should unsubscribe the EditorEvent listener');
  assert.equal(viewChangeCleanup.destroy.selectAfterDestroy, false,
    'destroy should disable the old selection bridge');

  const summary = page.locator('#nested-outline-test details > summary');
  await summary.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#nested-outline-test details').getAttribute('open'), null,
    'Space should activate the native disclosure control');
  await page.keyboard.press('Enter');
  assert.notEqual(await page.locator('#nested-outline-test details').getAttribute('open'), null,
    'Enter should activate the native disclosure control');
  assert.equal(dialogs, 0, 'synthetic hostile-looking text must not execute');
  assert.deepEqual(offOriginRequests, [], 'the example must not request off-origin resources');
  assert.equal(browserRequests.every((url) => url.startsWith(`http://127.0.0.1:${address.port}/`)), true);
  console.log('Accessible outline Chromium checks passed.');
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
