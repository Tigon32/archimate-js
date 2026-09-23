import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routes = new Map([
  ['/examples/read-only/', [ 'examples/read-only/index.html', 'text/html; charset=utf-8' ]],
  ['/examples/read-only/viewer.js', [ 'examples/read-only/viewer.js', 'text/javascript; charset=utf-8' ]],
  ['/.ci-build/archimate-js.js', [ '.ci-build/archimate-js.js', 'text/javascript; charset=utf-8' ]],
  ['/test/fixtures/synthetic/minimal-application-view.xml', [
    'test/fixtures/synthetic/minimal-application-view.xml', 'application/xml; charset=utf-8'
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
let stage = 'launch browser';
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || puppeteer.executablePath(),
    headless: true,
    args: [ '--no-sandbox', '--disable-setuid-sandbox' ]
  });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const offOriginRequests = [];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith(origin + '/')) {
      request.continue();
    } else {
      offOriginRequests.push(request.url().split(':')[0]);
      request.abort();
    }
  });

  stage = 'load read-only example';
  await page.goto(origin + '/examples/read-only/', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const status = document.querySelector('#status')?.textContent;
    return status && !status.startsWith('Loading');
  }, { timeout: 10000 });
  const status = await page.$eval('#status', (element) => element.textContent);
  if (status !== 'Loaded the public synthetic example.') {
    const failureCode = await page.evaluate(async () => {
      if (!window.ArchimateJS || typeof window.ArchimateJS.mountViewer !== 'function') {
        return 'API_UNAVAILABLE';
      }
      const xml = await (await fetch('/test/fixtures/synthetic/minimal-application-view.xml')).text();
      const error = await window.ArchimateJS.mountViewer({
        xml,
        viewId: 'view-synthetic-minimal',
        container: document.createElement('div')
      }).catch((failure) => failure);
      return error && [
        'INVALID_OPTIONS', 'MODEL_TOO_LARGE', 'MODEL_IMPORT_FAILED', 'VIEW_NOT_FOUND',
        'VIEW_NAME_AMBIGUOUS', 'VIEW_RENDER_FAILED', 'VIEW_SELECTION_FAILED', 'VIEWER_FAILURE'
      ].includes(error.code) ? error.code : 'UNEXPECTED_FAILURE';
    });
    stage = `read-only example failure (${failureCode})`;
    throw new Error('Read-only example failed.');
  }
  assert.equal(status, 'Loaded the public synthetic example.');

  stage = 'render selected view to SVG';
  const result = await page.evaluate(async () => {
    const safeCode = (error) => error && [
      'INVALID_OPTIONS', 'MODEL_TOO_LARGE', 'MODEL_IMPORT_FAILED', 'VIEW_NOT_FOUND',
      'VIEW_NAME_AMBIGUOUS', 'VIEW_RENDER_FAILED', 'VIEW_SELECTION_FAILED', 'VIEWER_FAILURE'
    ].includes(error.code) ? error.code : 'UNEXPECTED_FAILURE';
    let phase = 'initialize render context';
    try {
    const api = window.ArchimateJS;
    const host = document.createElement('div');
    document.body.appendChild(host);
    phase = 'load synthetic model';
    const xml = await (await fetch('/test/fixtures/synthetic/minimal-application-view.xml')).text();
    let first;
    try {
      first = await api.renderViewToSvg({
        xml,
        viewName: 'Synthetic Minimal View',
        title: 'Synthetic report view',
        description: 'Synthetic application component and service'
      });
    } catch (error) {
      return { failurePhase: 'render by name', failureCode: safeCode(error) };
    }
    let second;
    try {
      second = await api.renderViewToSvg({
        xml,
        viewId: 'view-synthetic-minimal',
        title: 'Synthetic report view',
        description: 'Synthetic application component and service'
      });
    } catch (error) {
      return { failurePhase: 'render by id', failureCode: safeCode(error) };
    }
    phase = 'inspect SVG output';
    const parsed = new DOMParser().parseFromString(first, 'image/svg+xml');
    const firstText = parsed.documentElement.textContent;
    const firstPaths = Array.from(parsed.querySelectorAll('path'), (path) => path.getAttribute('d') || '').join(' ');
    const firstPathCount = parsed.querySelectorAll('path').length;
    const firstNestedGroupCount = parsed.querySelectorAll('g g').length;
    const hasUnsafeExportMarkup = parsed.querySelector('script, foreignObject, img') !== null;
    let mounted;
    try {
      phase = 'mount selected view';
      mounted = await api.mountViewer({
        xml,
        viewId: 'view-synthetic-minimal',
        container: host,
        width: 640,
        height: 480
      });
    } catch (error) {
      return { failurePhase: 'mount selected view', failureCode: safeCode(error) };
    }
    const componentShape = mounted.get('elementRegistry').get('node-application-component-1');
    phase = 'snapshot mounted model';
    const modelBeforeExport = mounted.getModel();
    const modelSnapshotBeforeExport = JSON.stringify({
      name: modelBeforeExport.name,
      elementCount: modelBeforeExport.elementsNode.baseElements.length,
      relationshipCount: modelBeforeExport.relationshipsNode.relationships.length,
      viewCount: modelBeforeExport.views.diagrams.viewsList.length,
      viewName: modelBeforeExport.views.diagrams.viewsList[0].name
    });
    try {
      phase = 'export mounted view';
      await mounted.saveSVG({ title: 'Mounted synthetic view' });
    } catch (error) {
      mounted.destroy();
      host.remove();
      return { failurePhase: 'export mounted view', failureCode: safeCode(error) };
    }
    const modelAfterExport = mounted.getModel();
    const modelSnapshotAfterExport = JSON.stringify({
      name: modelAfterExport.name,
      elementCount: modelAfterExport.elementsNode.baseElements.length,
      relationshipCount: modelAfterExport.relationshipsNode.relationships.length,
      viewCount: modelAfterExport.views.diagrams.viewsList.length,
      viewName: modelAfterExport.views.diagrams.viewsList[0].name
    });
    const exportedTextHasLabel = host.textContent.includes('Component label');
    const exportedTextCount = host.querySelectorAll('text').length;
    phase = 'clean up mounted view';
    mounted.destroy();
    host.remove();

    return {
      same: first === second,
      hasTitle: parsed.querySelector('title')?.textContent === 'Synthetic report view',
      hasDescription: parsed.querySelector('desc')?.textContent === 'Synthetic application component and service',
      liveTextElementCount: document.querySelectorAll('#diagram text').length,
      exportedShapeHasLabel: componentShape?.businessObject?.label?.includes('Component label') === true,
      exportedTextHasLabel,
      exportedTextCount,
      hasComponentName: firstText.includes('Application Component'),
      hasServiceName: firstText.includes('Application Service'),
      hasViewLabel: firstText.includes('Component label'),
      textElementCount: parsed.querySelectorAll('text').length,
      pathCount: firstPathCount,
      pathData: firstPaths,
      nestedGroups: firstNestedGroupCount,
      hasScriptMarkup: hasUnsafeExportMarkup,
      liveModelScriptCount: document.querySelectorAll('#diagram script, #diagram img').length,
      payloadCodeRan: window.__syntheticModelCodeRan === true,
      modelUnchanged: modelBeforeExport === modelAfterExport &&
        modelSnapshotBeforeExport === modelSnapshotAfterExport
    };
    } catch (error) {
      return { failurePhase: phase, failureCode: safeCode(error) };
    }
  });

  if (result.failurePhase) {
    stage = `${result.failurePhase} (${result.failureCode})`;
    throw new Error('Synthetic browser render failed.');
  }

  stage = 'check repeated SVG stability';
  assert.equal(result.same, true);
  stage = 'check accessible SVG metadata';
  assert.equal(result.hasTitle, true);
  assert.equal(result.hasDescription, true);
  stage = 'check live SVG text nodes';
  assert.ok(result.liveTextElementCount > 0, 'example should render SVG text nodes');
  stage = 'check selected view node label';
  assert.equal(result.exportedShapeHasLabel, true);
  stage = 'check mounted SVG text nodes';
  assert.ok(result.exportedTextCount > 0, 'SVG should include text nodes');
  stage = 'check mounted SVG custom label';
  assert.equal(result.exportedTextHasLabel, true);
  stage = 'check canonical SVG custom label';
  assert.equal(result.hasViewLabel, true);
  assert.ok(result.textElementCount > 0, 'SVG should render labels as text');
  stage = 'check fixture element names';
  assert.equal(result.hasServiceName, true);
  stage = 'check rendered paths';
  assert.ok(result.pathCount > 0, 'SVG should contain relationship or shape paths');
  stage = 'check rendered bendpoints';
  assert.match(result.pathData, /260/);
  assert.match(result.pathData, /310/);
  assert.match(result.pathData, /360/);
  stage = 'check nested view structure';
  assert.ok(result.nestedGroups > 0, 'SVG should preserve nested view structure');
  stage = 'check model markup safety';
  assert.equal(result.hasScriptMarkup, false);
  assert.equal(result.liveModelScriptCount, 0);
  assert.equal(result.payloadCodeRan, false);
  assert.equal(offOriginRequests.length, 0);
  stage = 'check export model immutability';
  assert.equal(result.modelUnchanged, true);
  console.log('browser render smoke test passed');
} catch {
  throw new Error(`Browser render smoke test failed during: ${stage}.`);
} finally {
  if (browser) {
    await browser.close();
  }
  await new Promise((resolve) => server.close(resolve));
}
