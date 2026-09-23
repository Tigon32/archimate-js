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
  context = await browser.newContext();
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
  await page.waitForFunction(() => {
    const status = document.querySelector('#status')?.textContent;
    return status && !status.startsWith('Loading');
  }, null, { timeout: 10000 });
  assert.equal(await page.locator('#status').textContent(), 'Loaded the public synthetic example.');
  assert.ok(await page.locator('#diagram svg text').count() > 0, 'HTML embed should render the synthetic view');
  const embeddedDiagramText = await page.locator('#diagram svg').textContent();
  assert.ok(embeddedDiagramText.includes('Component label'));
  assert.ok(embeddedDiagramText.includes('Application Service'));

  stage = 'render deterministic report SVG from the embedded view source';
  const report = await page.evaluate(async () => {
    const xml = await (await fetch('/test/fixtures/synthetic/minimal-application-view.xml')).text();
    const api = window.ArchimateJS;
    const first = await api.renderViewToSvg({
      xml,
      viewId: 'view-synthetic-minimal',
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
        viewId: 'view-synthetic-minimal'
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
      svgHasSyntheticLabels: first.includes('Component label') && first.includes('Application Service'),
      hasSafeSvgMetadata: parsed.querySelector('title')?.textContent === 'Synthetic report view' &&
        parsed.querySelector('desc')?.textContent === 'Synthetic application component and service',
      hasActiveMarkup: parsed.querySelector('script, foreignObject, img') !== null,
      markdown,
      svg: first,
      missingViewDiagnostic,
      malformedDiagnostic: diagnostic
    };
  });

  stage = 'assert deterministic SVG and Markdown image artifact path';
  assert.equal(report.deterministic, true);
  assert.equal(report.svgHasSyntheticLabels, true);
  assert.equal(report.hasSafeSvgMetadata, true);
  assert.equal(report.hasActiveMarkup, false);
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
