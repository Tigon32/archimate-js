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
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith(origin + '/')) {
      request.continue();
    } else {
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
        'VIEW_NAME_AMBIGUOUS', 'VIEW_SELECTION_FAILED', 'VIEWER_FAILURE'
      ].includes(error.code) ? error.code : 'UNEXPECTED_FAILURE';
    });
    stage = `read-only example failure (${failureCode})`;
    throw new Error('Read-only example failed.');
  }
  assert.equal(status, 'Loaded the public synthetic example.');

  stage = 'render selected view to SVG';
  const result = await page.evaluate(async () => {
    const api = window.ArchimateJS;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const xml = await (await fetch('/test/fixtures/synthetic/minimal-application-view.xml')).text();
    const first = await api.renderViewToSvg({
      xml,
      viewName: 'Synthetic Minimal View',
      title: 'Synthetic report view',
      description: 'Synthetic application component and service'
    });
    const second = await api.renderViewToSvg({
      xml,
      viewId: 'view-synthetic-minimal',
      title: 'Synthetic report view',
      description: 'Synthetic application component and service'
    });
    const parsed = new DOMParser().parseFromString(first, 'image/svg+xml');
    const mounted = await api.mountViewer({
      xml,
      viewId: 'view-synthetic-minimal',
      container: host,
      width: 640,
      height: 480
    });
    const modelNameBeforeExport = mounted.getModel().name;
    await mounted.saveSVG({ title: 'Mounted synthetic view' });
    const modelNameAfterExport = mounted.getModel().name;
    mounted.destroy();
    host.remove();

    return {
      same: first === second,
      hasTitle: parsed.querySelector('title')?.textContent === 'Synthetic report view',
      hasDescription: parsed.querySelector('desc')?.textContent === 'Synthetic application component and service',
      hasExpectedText: parsed.documentElement.textContent.includes('Application Component') &&
        parsed.documentElement.textContent.includes('Component label'),
      pathCount: parsed.querySelectorAll('path').length,
      pathData: Array.from(parsed.querySelectorAll('path'), (path) => path.getAttribute('d') || '').join(' '),
      nestedGroups: Array.from(parsed.querySelectorAll('g g')).length,
      hasScriptMarkup: parsed.querySelector('script, foreignObject, img') !== null,
      liveModelScriptCount: document.querySelectorAll('#diagram script, #diagram img').length,
      payloadCodeRan: window.__syntheticModelCodeRan === true,
      modelUnchanged: modelNameBeforeExport === modelNameAfterExport
    };
  });

  stage = 'check stable SVG and structure';
  assert.equal(result.same, true);
  assert.equal(result.hasTitle, true);
  assert.equal(result.hasDescription, true);
  assert.equal(result.hasExpectedText, true);
  assert.ok(result.pathCount > 0, 'SVG should contain relationship or shape paths');
  assert.match(result.pathData, /260/);
  assert.match(result.pathData, /310/);
  assert.match(result.pathData, /360/);
  assert.ok(result.nestedGroups > 0, 'SVG should preserve nested view structure');
  assert.equal(result.hasScriptMarkup, false);
  assert.equal(result.liveModelScriptCount, 0);
  assert.equal(result.payloadCodeRan, false);
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
