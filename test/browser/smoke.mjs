import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resultsDirectory = path.join(root, 'test-results');
const routes = new Map([
  ['/examples/read-only/', [ 'examples/read-only/index.html', 'text/html; charset=utf-8' ]],
  ['/examples/read-only/viewer.js', [ 'examples/read-only/viewer.js', 'text/javascript; charset=utf-8' ]],
  ['/examples/read-only/theme.js', [ 'examples/read-only/theme.js', 'text/javascript; charset=utf-8' ]],
  ['/.ci-build/model-dto.js', [ '.ci-build/model-dto.js', 'text/javascript; charset=utf-8' ]],
  ['/examples/read-only/diagram.css', [ 'examples/read-only/diagram.css', 'text/css; charset=utf-8' ]],
  ['/assets/design-tokens/app-shell.css', [ 'assets/design-tokens/app-shell.css', 'text/css; charset=utf-8' ]],
  ['/assets/design-tokens/app.generated.css', [ 'assets/design-tokens/app.generated.css', 'text/css; charset=utf-8' ]],
  ['/assets/ibm-plex-font/IBMPlexSans-Regular.ttf', [ 'assets/ibm-plex-font/IBMPlexSans-Regular.ttf', 'font/ttf' ]],
  ['/assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', [ 'assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', 'font/ttf' ]],
  ['/node_modules/diagram-js/assets/diagram-js.css', [ 'node_modules/diagram-js/assets/diagram-js.css', 'text/css; charset=utf-8' ]],
  ['/.ci-build/archimate-js.js', [ '.ci-build/archimate-js.js', 'text/javascript; charset=utf-8' ]],
  ['/test/fixtures/synthetic/read-only-showcase.xml', [
    'test/fixtures/synthetic/read-only-showcase.xml', 'application/xml; charset=utf-8'
  ]],
  ['/test/fixtures/synthetic/directed-association.xml', [
    'test/fixtures/synthetic/directed-association.xml', 'application/xml; charset=utf-8'
  ]],
  ['/test/fixtures/synthetic/dto-export-view.xml', [
    'test/fixtures/synthetic/dto-export-view.xml', 'application/xml; charset=utf-8'
  ]],
  ['/test/fixtures/meff-schema/valid-view-presentation.xml', [
    'test/fixtures/meff-schema/valid-view-presentation.xml', 'application/xml; charset=utf-8'
  ]]
]);

const server = createServer((request, response) => {
  const route = routes.get(new URL(request.url, 'http://localhost').pathname);
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('content-type', route[1]);
  createReadStream(path.join(root, route[0])).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

let browser;
let context;
let page;
let stage = 'launch browser';
let failed = false;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    headless: true,
    args: [ '--no-sandbox', '--disable-setuid-sandbox' ]
  });
  context = await browser.newContext({ colorScheme: 'light' });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const offOriginRequestCount = { value: 0 };
  const consoleMessages = [];
  await context.route('**/*', (route) => {
    if (route.request().url().startsWith(origin + '/')) {
      return route.continue();
    }
    offOriginRequestCount.value++;
    return route.abort();
  });
  page.on('console', (message) => consoleMessages.push(message.text()));

  stage = 'load synthetic read-only example';
  await page.goto(origin + '/examples/read-only/', { waitUntil: 'networkidle' });
  await page.locator('#status').waitFor({ state: 'visible' });
  stage = 'check theme selector, persistence and OS preference';
  const chooser = page.getByLabel('Theme', { exact: false });
  assert.equal(await chooser.inputValue(), 'default');
  assert.equal(await page.locator('.am-app').getAttribute('data-theme'), 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('.am-app[data-theme="dark"]').waitFor();
  await chooser.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  assert.equal(await chooser.inputValue(), 'high-contrast-dark');
  assert.equal(await page.locator('.am-app').getAttribute('data-theme'), 'high-contrast-dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('archimate-js.ui-theme')), 'high-contrast-dark');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#theme-choice').inputValue(), 'high-contrast-dark');
  assert.equal(await page.locator('.am-app').getAttribute('data-theme'), 'high-contrast-dark');
  await page.locator('#theme-choice').selectOption('default');
  assert.equal(await page.locator('.am-app').getAttribute('data-theme'), 'dark');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.locator('.am-app[data-theme="light"]').waitFor();
  await page.locator('#theme-choice').selectOption('high-contrast-light');
  assert.equal(await page.locator('.am-app').getAttribute('data-theme'), 'high-contrast-light');
  await page.locator('#theme-choice').selectOption('light');
  await page.locator('#theme-choice').selectOption('dark');
  assert.equal(await page.locator('.am-app').getAttribute('data-theme'), 'dark');
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });
  assert.equal(await page.locator('.am-app').getAttribute('data-theme'), 'dark');
  await page.emulateMedia({ colorScheme: 'light', forcedColors: 'none', reducedMotion: 'no-preference' });

  stage = 'check DTO import eligibility in the browser';
  const eligibility = await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/.ci-build/model-dto.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    const api = window.ArchimateModelDto;
    const supported = await (await fetch('/test/fixtures/synthetic/dto-export-view.xml')).text();
    const unsupported = await (await fetch('/test/fixtures/meff-schema/valid-view-presentation.xml')).text();
    const supportedEntry = api.createDtoEditorFromMeff(supported);
    const rejectedEntry = api.createDtoEditorFromMeff(unsupported);
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.append(container);
    const viewer = await window.ArchimateJS.mountViewer({ xml: supported, container });
    const port = new api.DiagramJsCanvasPort({
      canvas: viewer.get('canvas'),
      elementFactory: viewer.get('elementFactory'),
      eventBus: viewer.get('eventBus'),
      selection: viewer.get('selection'),
      modeling: viewer.get('modeling')
    });
    const editableModel = structuredClone(supportedEntry.model);
    const originalSnapshot = JSON.stringify(supportedEntry.model);
    editableModel.views.push({ id: 'view-two', nodes: [], connections: [] });
    const editor = new api.DiagramAdapter(editableModel);
    let selectionEvents = 0;
    const publicEvents = [];
    editor.subscribe((event) => {
      if (event.type === 'selection') selectionEvents++;
      publicEvents.push(JSON.stringify(event));
    });
    const detach = editor.attach('view-dto-export', port);
    const registry = viewer.get('elementRegistry');
    const nestedParent = registry.get('node-service-nested')?.parent?.id;
    const renderedConnection = registry.get('serving-connection');
    const canvasIdsPresent = Boolean(registry.get('node-component') && renderedConnection);
    const sourceNode = supportedEntry.model.views[0].nodes[0];
    const nestedSource = sourceNode.nodes[0];
    const nestedShape = registry.get('node-service-nested');
    const parentShape = registry.get('node-component');
    const renderedNode = registry.get('node-component');
    const lineWidth = renderedNode?.style?.lineWidth;
    const visualShape = container.querySelector('[data-element-id="node-component"] .am-shape');
    viewer.get('selection').select([registry.get('node-component')]);
    const selectedIds = editor.project('view-dto-export').selectedIds;
    const beforeGestures = editor.serialize();
    const modeling = viewer.get('modeling');
    modeling.moveElements([registry.get('node-component')], { x: 12, y: -5 });
    modeling.resizeShape(registry.get('node-service'), { x: 210, y: 30, width: 150, height: 80 });
    modeling.updateLabel(registry.get('node-component'), 'Updated component');
    const edited = editor.serialize();
    const changedNode = editor.project('view-dto-export').nodes.find((node) => node.id === 'node-component');
    const changedCanvas = registry.get('node-component');
    const changedServiceWidth = registry.get('node-service')?.width;
    let unsupportedUnchanged = false;
    try {
      modeling.moveElements([changedCanvas], { x: 1, y: 1 }, registry.get('node-service'));
    } catch (error) {
      unsupportedUnchanged = error.code === 'MODEL_DTO_INVALID' && editor.serialize() === edited &&
        registry.get('node-component') === changedCanvas;
    }
    const undoRestored = editor.undo() && editor.undo() && editor.undo() && editor.serialize() === beforeGestures &&
      registry.get('node-component')?.x === sourceNode.x;
    const redoRestored = editor.redo() && editor.redo() && editor.redo() && editor.serialize() === edited &&
      registry.get('node-component')?.name === 'Updated component';
    editor.undo(); editor.undo(); editor.undo();
    const beforeTopology = editor.serialize();
    const createdCanvas = modeling.createConnection(registry.get('node-component'),
      registry.get('node-service'), { id: 'new-connection', type: 'Serving',
        waypoints: [{ x: 160, y: 75 }, { x: 220, y: 90 }, { x: 300, y: 75 }] });
    const added = editor.getModel();
    const newConnection = added.views[0].connections.find((item) => item.id === 'new-connection');
    const semantic = added.relationships.find((item) => item.id === newConnection?.relationshipId);
    const created = createdCanvas?.id === 'new-connection' &&
      registry.get('new-connection')?.source?.id === 'node-component' &&
      semantic?.sourceId === 'component-one' && semantic?.targetId === 'service-two' &&
      newConnection?.waypoints[1].x === 220;
    modeling.reconnectEnd(registry.get('new-connection'), registry.get('node-service-nested'),
      { x: 105, y: 175 });
    const reconnected = editor.getModel().views[0].connections.find((item) => item.id === 'new-connection');
    const endpointsPreserved = reconnected?.targetId === 'node-service-nested' &&
      reconnected.waypoints[1].x === 220 && reconnected.waypoints.at(-1).x === 105 &&
      registry.get('new-connection')?.target?.id === 'node-service-nested';
    const beforeInvalid = editor.serialize();
    let invalidUnchanged = false;
    try {
      modeling.createConnection(registry.get('node-component'), registry.get('node-service'),
        { id: 'invalid-connection', type: 'Relationship' });
    } catch {
      invalidUnchanged = editor.serialize() === beforeInvalid && !registry.get('invalid-connection');
    }
    modeling.removeElements([registry.get('node-service-nested')]);
    const afterDelete = editor.getModel();
    const viewDeletedOnly = !afterDelete.views[0].connections.some((item) => item.id === 'new-connection') &&
      afterDelete.elements.length === added.elements.length &&
      afterDelete.relationships.length === added.relationships.length;
    const topologyUndo = editor.undo() && editor.serialize() === beforeInvalid &&
      editor.undo() && editor.undo() && editor.serialize() === beforeTopology;
    const topologyRedo = editor.redo() && editor.redo() && editor.redo() &&
      editor.getModel().views[0].nodes[0].nodes.length === 0;
    editor.undo(); editor.undo(); editor.undo();
    const untouched = JSON.stringify(supportedEntry.model) === originalSnapshot;
    detach();
    const clearedOnDetach = registry.get('node-component') === undefined;
    const detachSecondView = editor.attach('view-two', port);
    const clearedOnSwitch = registry.get('node-component') === undefined;
    detachSecondView();
    const detachOriginalView = editor.attach('view-dto-export', port);
    const coordinatesRestored = registry.get('node-component')?.x === sourceNode.x &&
      registry.get('node-component')?.y === sourceNode.y;
    viewer.get('selection').select([registry.get('node-component')]);
    const selectionEventCount = selectionEvents;
    detachOriginalView();
    viewer.destroy();
    container.remove();
    return {
      supported: supportedEntry.eligible && supportedEntry.editor.getModel().id === 'model-dto-export',
      unsupported: rejectedEntry.eligible === false &&
        rejectedEntry.reasons[0]?.code === 'DTO_UNSUPPORTED_FIELDS' &&
        !('model' in rejectedEntry) && !('editor' in rejectedEntry),
      canvasIds: canvasIdsPresent,
      nested: nestedParent === 'node-component',
      nestedGeometry: nestedShape?.x + parentShape?.x === nestedSource.x &&
        nestedShape?.y + parentShape?.y === nestedSource.y,
      geometry: renderedNode?.x === sourceNode.x && renderedNode?.y === sourceNode.y &&
        renderedNode?.width === sourceNode.width && renderedNode?.height === sourceNode.height,
      label: renderedNode?.name === 'Component One',
      renderedStyle: Boolean(visualShape && getComputedStyle(visualShape).stroke !== 'none'),
      endpoints: renderedConnection?.source?.id === 'node-component' &&
        renderedConnection?.target?.id === 'node-service',
      styled: lineWidth === 7,
      selection: selectedIds.includes('node-component'),
      selectionEvents: selectionEventCount === 2,
      gesturesUpdatedDto: changedNode?.x === sourceNode.x + 12 && changedNode?.y === sourceNode.y - 5 &&
        changedNode?.label === 'Updated component',
      gesturesUpdatedCanvas: changedCanvas?.x === sourceNode.x + 12 && changedCanvas?.y === sourceNode.y - 5 &&
        changedCanvas?.name === 'Updated component' && changedServiceWidth === 150,
      unsupportedUnchanged,
      undoRestored,
      redoRestored,
      created,
      endpointsPreserved,
      invalidUnchanged,
      viewDeletedOnly,
      topologyUndo,
      topologyRedo,
      eventPayloadsArePlain: publicEvents.length >= 5 &&
        publicEvents.every((event) => !/businessObject|\$parent|\$type/.test(event)),
      serializedStateIsPlain: !editor.serialize().includes('businessObject'),
      detached: clearedOnDetach,
      switchedViewCleared: clearedOnSwitch,
      coordinatesRestored,
      sourceUnchanged: untouched
    };
  });
  assert.deepEqual(eligibility, {
    supported: true, unsupported: true, canvasIds: true, nested: true, nestedGeometry: true,
    geometry: true, label: true, renderedStyle: true, endpoints: true, styled: true,
    selection: true, selectionEvents: true, gesturesUpdatedDto: true, gesturesUpdatedCanvas: true,
    unsupportedUnchanged: true, undoRestored: true, redoRestored: true,
    created: true, endpointsPreserved: true, invalidUnchanged: true, viewDeletedOnly: true,
    topologyUndo: true, topologyRedo: true, eventPayloadsArePlain: true,
    serializedStateIsPlain: true, detached: true, switchedViewCleared: true,
    coordinatesRestored: true, sourceUnchanged: true
  });

  await page.waitForFunction(() => {
    const status = document.querySelector('#status')?.textContent;
    return status && !status.startsWith('Loading');
  }, null, { timeout: 10000 });
  assert.equal(await page.locator('#status').textContent(), 'Loaded the public synthetic service delivery example.');
  assert.equal(await page.locator('#status').getAttribute('data-state'), 'success');
  assert.ok(await page.locator('#diagram svg text').count() >= 5, 'HTML embed should render the multi-layer synthetic view');
  const embeddedDiagramText = await page.locator('#diagram svg.am-diagram').textContent();
  assert.ok(embeddedDiagramText.includes('Assigns request'),
    'viewer should render the named imported relationship label');
  const diagramBounds = await page.locator('#diagram svg.am-diagram').boundingBox();
  assert.ok(diagramBounds && diagramBounds.width > 0 && diagramBounds.height > 0,
    'HTML embed should have visible diagram dimensions');
  for (const label of ['Customer', 'Submit request', 'Request service', 'Request portal', 'Cloud platform']) {
    assert.ok(embeddedDiagramText.includes(label), `HTML embed should include ${label}`);
  }
  const visualState = await page.locator('#diagram').evaluate((container) => {
    const shapes = [...container.querySelectorAll('.djs-shape .djs-visual rect')];
    const connections = [...container.querySelectorAll('.djs-connection .djs-visual path')];
    return {
      shapes: shapes.length,
      shapeFills: shapes.map((shape) => getComputedStyle(shape).fill),
      connections: connections.length,
      connectionStrokes: connections.map((path) => getComputedStyle(path).stroke),
      stylesheetLoaded: [...document.styleSheets].some((sheet) => sheet.href?.endsWith('/diagram.css'))
    };
  });
  assert.equal(visualState.stylesheetLoaded, true, 'read-only page should load its local renderer stylesheet');
  assert.ok(visualState.shapes >= 5, 'all ArchiMate element boxes should be drawn');
  assert.ok(visualState.shapeFills.every((fill) => fill !== 'rgb(0, 0, 0)' && fill !== 'none'),
    'element boxes should have visible layer fills');
  assert.ok(visualState.connections >= 4, 'all ArchiMate relationships should be drawn');
  assert.ok(visualState.connectionStrokes.every((stroke) => stroke !== 'rgb(255, 0, 255)'),
    'relationships should not fall back to browser magenta');
  const beforeTheme = await page.locator('#diagram .djs-shape .djs-visual rect').evaluateAll((items) =>
    items.map((item) => getComputedStyle(item).fill));
  await page.locator('.am-app').evaluate((app) => app.setAttribute('data-theme', 'dark'));
  assert.equal(await page.locator('.am-app').evaluate((app) =>
    getComputedStyle(app).getPropertyValue('--am-ui-surface').trim()), '#1e1f22');
  assert.deepEqual(await page.locator('#diagram .djs-shape .djs-visual rect').evaluateAll((items) =>
    items.map((item) => getComputedStyle(item).fill)), beforeTheme,
  'dark UI theme must not recolor diagram shapes');
  stage = 'check scoped palette and status styles';
  const paletteTheme = await page.evaluate(() => {
    const app = document.querySelector('.am-app');
    const palette = document.createElement('div');
    palette.className = 'djs-palette';
    palette.innerHTML = '<div class="entry" title="Synthetic palette entry"></div>';
    app.append(palette);
    const colors = () => ({
      palette: getComputedStyle(palette).backgroundColor,
      entry: getComputedStyle(palette.querySelector('.entry')).color,
      status: getComputedStyle(document.querySelector('#status')).backgroundColor
    });
    const dark = colors();
    app.dataset.theme = 'light';
    const light = colors();
    palette.remove();
    return { dark, light };
  });
  assert.notEqual(paletteTheme.dark.palette, paletteTheme.light.palette);
  assert.notEqual(paletteTheme.dark.entry, paletteTheme.light.entry);
  assert.notEqual(paletteTheme.dark.status, paletteTheme.light.status);
  assert.equal(offOriginRequestCount.value, 0, 'app shell and local fonts must stay offline');
  await mkdir(resultsDirectory, { recursive: true });
  await page.screenshot({ path: path.join(resultsDirectory, 'read-only-showcase.png'), fullPage: true });

  stage = 'render deterministic report SVG from the embedded view source';
  const report = await page.evaluate(async () => {
    const xml = await (await fetch('/test/fixtures/synthetic/read-only-showcase.xml')).text();
    const api = window.ArchimateJS;
    const first = await api.renderViewToSvg({
      xml,
      viewId: 'view-synthetic-showcase',
      title: 'Synthetic report view',
      description: 'Synthetic service delivery across business, application, and technology'
    });
    const second = await api.renderViewToSvg({
      xml,
      viewId: 'view-synthetic-showcase',
      title: 'Synthetic report view',
      description: 'Synthetic service delivery across business, application, and technology'
    });
    const parsed = new DOMParser().parseFromString(first, 'image/svg+xml');
    const markdown = '![Synthetic report view](synthetic-minimal-view.svg)';
    let missingViewDiagnostic;
    try {
      await api.renderViewToSvg({ xml, viewId: 'synthetic-missing-view-id' });
    } catch (error) {
      missingViewDiagnostic = { code: error.code, message: error.message };
    }
    const malformedMarker = 'SYNTHETIC_MALFORMED_MARKER_7d210e';
    let diagnostic;
    try {
      await api.renderViewToSvg({
        xml: `<model>${malformedMarker}</model><`,
        viewId: 'view-synthetic-showcase'
      });
    } catch (error) {
      diagnostic = {
        code: error.code,
        message: error.message,
        serialized: JSON.stringify({
          name: error.name,
          message: error.message,
          code: error.code,
          stack: error.stack,
          diagnostics: error.diagnostics
        }),
        marker: malformedMarker
      };
    }
    return {
      deterministic: first === second,
      svgHasSyntheticLabels: ['Customer', 'Submit request', 'Request service', 'Request portal', 'Cloud platform']
        .every((label) => first.includes(label)),
      hasSafeSvgMetadata: parsed.querySelector('title')?.textContent === 'Synthetic report view' &&
        parsed.querySelector('desc')?.textContent === 'Synthetic service delivery across business, application, and technology',
      hasActiveMarkup: parsed.querySelector('script, foreignObject, img') !== null,
      markdown,
      svg: first,
      missingViewDiagnostic,
      malformedDiagnostic: diagnostic
    };
  });

  stage = 'assert deterministic report SVG bytes';
  assert.equal(report.deterministic, true);
  stage = 'assert report SVG labels';
  assert.equal(report.svgHasSyntheticLabels, true);
  stage = 'assert accessible SVG metadata';
  assert.equal(report.hasSafeSvgMetadata, true);
  stage = 'assert SVG has no active markup';
  assert.equal(report.hasActiveMarkup, false);
  stage = 'write and verify SVG artifact';
  const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), 'archimate-synthetic-report-'));
  try {
    const artifactPath = path.join(artifactDirectory, 'synthetic-minimal-view.svg');
    await writeFile(artifactPath, report.svg, { flag: 'wx' });
    const markdownAsset = await readFile(artifactPath, 'utf8');
    assert.equal(markdownAsset, report.svg);
    assert.ok(report.markdown.includes(`](${path.basename(artifactPath)})`));
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true });
  }
  assert.equal(report.missingViewDiagnostic?.code, 'VIEW_NOT_FOUND');
  assert.equal(report.missingViewDiagnostic?.message, 'The requested ArchiMate view was not found.');

  stage = 'import and export named and unnamed connections';
  const directedAssociation = await page.evaluate(async () => {
    const xml = await (await fetch('/test/fixtures/synthetic/directed-association.xml')).text();
    const api = window.ArchimateJS;
    const svg = await api.renderViewToSvg({
      xml,
      viewId: 'view-directed-association',
      title: 'Synthetic directed Association'
    });
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const path = parsed.querySelector('.djs-connection .djs-visual path');
    const unnamedXml = xml.replace(' name="Directed Association"', '');
    const unnamedSvg = await api.renderViewToSvg({
      xml: unnamedXml,
      viewId: 'view-directed-association',
      title: 'Synthetic unnamed Association'
    });
    const unnamed = new DOMParser().parseFromString(unnamedSvg, 'image/svg+xml');
    const repeatedSvg = await api.renderViewToSvg({
      xml: xml.replace('name="Component B"', 'name="Component A"'),
      viewId: 'view-directed-association'
    });
    const adversarialSvg = await api.renderViewToSvg({
      xml: xml.replace('name="Component A"', 'name="&lt;Front &amp; end&gt;"'),
      viewId: 'view-directed-association'
    });
    const repeated = new DOMParser().parseFromString(repeatedSvg, 'image/svg+xml');
    const adversarial = new DOMParser().parseFromString(adversarialSvg, 'image/svg+xml');
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'fixed', left: '-2000px', width: '1024px', height: '768px' });
    document.body.append(host);
    let saved;
    let viewer;
    try {
      viewer = await api.mountViewer({ xml, viewId: 'view-directed-association', container: host });
      saved = (await viewer.saveSVG({ title: 'Synthetic directed Association' })).svg;
    } finally {
      viewer?.destroy();
      host.remove();
    }
    const ids = [...parsed.querySelectorAll('[id]')].map((element) => element.id);
    const refs = [...parsed.querySelectorAll('[aria-labelledby], [aria-describedby]')]
      .flatMap((element) => [element.getAttribute('aria-labelledby'), element.getAttribute('aria-describedby')]
        .filter(Boolean).flatMap((value) => value.split(/\s+/)));
    const node = parsed.querySelector('.djs-shape .djs-visual[role="graphics-object group"]');
    const relation = parsed.querySelector('.djs-connection .djs-visual[role="graphics-object group"]');
    const unnamedRelation = unnamed.querySelector('.djs-connection .djs-visual[role="graphics-object group"]');

    return {
      markerStyle: path?.getAttribute('style'),
      markerShape: parsed.querySelector('defs marker path')?.getAttribute('d'),
      labelTexts: [...parsed.querySelectorAll('.djs-label')].map((label) => label.textContent),
      unnamedLabels: [...unnamed.querySelectorAll('.djs-label')].map((label) => label.textContent),
      rootRole: parsed.documentElement.getAttribute('role'),
      saveSvgRootRole: new DOMParser().parseFromString(saved, 'image/svg+xml').documentElement.getAttribute('role'),
      saveSvgRelationName: new DOMParser().parseFromString(saved, 'image/svg+xml')
        .querySelector('.djs-connection .djs-visual[role="graphics-object group"]')?.getAttribute('aria-label'),
      nodeName: node?.getAttribute('aria-label'),
      relationName: relation?.getAttribute('aria-label'),
      unnamedRelationName: unnamedRelation?.getAttribute('aria-label'),
      repeatedNames: [...repeated.querySelectorAll('.djs-shape .djs-visual[role="graphics-object group"]')]
        .map((item) => item.getAttribute('aria-label')),
      adversarialName: adversarial.querySelector('.djs-shape .djs-visual[role="graphics-object group"]')
        ?.getAttribute('aria-label'),
      adversarialParserError: adversarial.querySelector('parsererror')?.textContent?.slice(0, 500),
      adversarialMarkupStart: adversarialSvg.slice(0, 280),
      adversarialSemanticCount: adversarial.querySelectorAll('[role="graphics-object group"]').length,
      adversarialActiveMarkup: adversarial.querySelector('script, foreignObject') !== null,
      duplicateIds: ids.length !== new Set(ids).size,
      brokenReferences: refs.filter((id) => !ids.includes(id)),
      leaksRawIds: /data-element-id=|association-a-b|component-a|component-b/.test(svg),
      decorativeHidden: [...parsed.querySelectorAll('.djs-visual path, defs marker path')]
        .every((item) => item.getAttribute('aria-hidden') === 'true' || item.closest('[aria-hidden="true"]') !== null)
    };
  });
  assert.match(directedAssociation.markerStyle || '', /marker-end:\s*url\(['"]?#archimate-export-id-\d+/);
  assert.equal(directedAssociation.markerShape, 'M 1 5 L 11 10');
  assert.ok(directedAssociation.labelTexts.some((label) => label?.includes('Directed Association')),
    'named imported relationship should render a visible SVG label');
  assert.ok(!directedAssociation.unnamedLabels.some((label) => label?.includes('Directed Association')),
    'unnamed imported relationship should not create a visible SVG label');
  assert.equal(directedAssociation.rootRole, 'graphics-document document');
  assert.equal(directedAssociation.saveSvgRootRole, directedAssociation.rootRole);
  assert.equal(directedAssociation.saveSvgRelationName, directedAssociation.relationName);
  assert.match(directedAssociation.nodeName || '', /ApplicationComponent: Component A/);
  assert.match(directedAssociation.relationName || '', /Association.*Directed Association.*from Component A to Component B/);
  assert.match(directedAssociation.unnamedRelationName || '', /Association.*from Component A to Component B/);
  assert.ok(directedAssociation.repeatedNames.filter((name) => name?.includes('Component A')).length >= 2);
  assert.ok(directedAssociation.adversarialName?.includes('<Front & end>'));
  assert.equal(directedAssociation.adversarialActiveMarkup, false);
  assert.equal(directedAssociation.duplicateIds, false);
  assert.deepEqual(directedAssociation.brokenReferences, []);
  assert.equal(directedAssociation.leaksRawIds, false);
  assert.equal(directedAssociation.decorativeHidden, true);

  stage = 'render an explicitly styled imported connection width';
  const importedConnectionWidth = await page.evaluate(async () => {
    const xml = await (await fetch('/test/fixtures/synthetic/directed-association.xml')).text();
    const styledXml = xml.replace(
      '<archimate:Waypoints>',
      '<archimate:Style lineWidth="9" /><archimate:Waypoints>'
    );
    const svg = await window.ArchimateJS.renderViewToSvg({
      xml: styledXml,
      viewId: 'view-directed-association',
      title: 'Synthetic imported connection width'
    });
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const path = parsed.querySelector('.djs-connection .djs-visual path');
    return Number.parseFloat(path?.style.strokeWidth || path?.getAttribute('stroke-width') || 'NaN');
  });
  assert.equal(importedConnectionWidth, 9,
    'SVG export should preserve an explicitly imported connection width');

  stage = 'assert malformed input returns content-free diagnostic';
  assert.equal(report.malformedDiagnostic?.code, 'MODEL_IMPORT_FAILED');
  assert.equal(report.malformedDiagnostic?.message, 'Unable to load the ArchiMate model.');
  assert.equal(report.malformedDiagnostic?.message.includes(report.malformedDiagnostic.marker), false);
  assert.equal(report.malformedDiagnostic?.serialized.includes(report.malformedDiagnostic.marker), false);
  assert.equal(consoleMessages.some((message) => message.includes(report.malformedDiagnostic.marker)), false);
  assert.equal(offOriginRequestCount.value, 0);
  console.log('Playwright browser report smoke tests passed');
} catch {
  failed = true;
  await mkdir(resultsDirectory, { recursive: true });
  if (page) {
    await page.screenshot({ path: path.join(resultsDirectory, 'failure.png'), fullPage: true }).catch(() => {});
  }
  if (context) {
    await context.tracing.stop({ path: path.join(resultsDirectory, 'failure-trace.zip') }).catch(() => {});
  }
  throw new Error(`Playwright browser report smoke tests failed during: ${stage}.`);
} finally {
  if (context && !failed) {
    await context.tracing.stop();
  }
  if (browser) {
    await browser.close();
  }
  await new Promise((resolve) => server.close(resolve));
}
