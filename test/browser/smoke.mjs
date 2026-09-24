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
  ['/examples/read-only/diagram.css', [ 'examples/read-only/diagram.css', 'text/css; charset=utf-8' ]],
  ['/node_modules/diagram-js/assets/diagram-js.css', [ 'node_modules/diagram-js/assets/diagram-js.css', 'text/css; charset=utf-8' ]],
  ['/.ci-build/archimate-js.js', [ '.ci-build/archimate-js.js', 'text/javascript; charset=utf-8' ]],
  ['/test/fixtures/synthetic/read-only-showcase.xml', [
    'test/fixtures/synthetic/read-only-showcase.xml', 'application/xml; charset=utf-8'
  ]],
  ['/test/fixtures/synthetic/directed-association.xml', [
    'test/fixtures/synthetic/directed-association.xml', 'application/xml; charset=utf-8'
  ]],
  ['/test/fixtures/meff-schema/valid-view-diagram.xml', [
    'test/fixtures/meff-schema/valid-view-diagram.xml', 'application/xml; charset=utf-8'
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
  assert.equal(await page.locator('#status').textContent(), 'Loaded the public synthetic service delivery example.');
  assert.ok(await page.locator('#diagram svg text').count() >= 5, 'HTML embed should render the multi-layer synthetic view');
  const embeddedDiagramText = await page.locator('#diagram svg').textContent();
  assert.ok(embeddedDiagramText.includes('Assigns request'),
    'viewer should render the named imported relationship label');
  const diagramBounds = await page.locator('#diagram svg').boundingBox();
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

    return {
      markerStyle: path?.getAttribute('style'),
      markerShape: parsed.querySelector('defs marker path')?.getAttribute('d'),
      labelTexts: [...parsed.querySelectorAll('[data-element-id$="_label"] .djs-label')].map((label) => label.textContent),
      unnamedLabels: [...unnamed.querySelectorAll('[data-element-id$="_label"] .djs-label')].map((label) => label.textContent)
    };
  });
  assert.match(directedAssociation.markerStyle || '', /marker-end:\s*url\(['"]?#archimate-export-id-\d+/);
  assert.equal(directedAssociation.markerShape, 'M 1 5 L 11 10');
  assert.ok(directedAssociation.labelTexts.some((label) => label?.includes('Directed Association')),
    'named imported relationship should render a visible SVG label');
  assert.deepEqual(directedAssociation.unnamedLabels, [],
    'unnamed imported relationship should not create a visible SVG label');

  stage = 'render imported MEFF connection width';
  const meffConnectionWidth = await page.evaluate(async () => {
    const xml = await (await fetch('/test/fixtures/meff-schema/valid-view-diagram.xml')).text();
    const svg = await window.ArchimateJS.renderViewToSvg({
      xml,
      viewId: 'view-synthetic-one',
      title: 'Synthetic MEFF connection width'
    });
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return parsed.querySelector('.djs-connection .djs-visual path')?.getAttribute('stroke-width');
  });
  assert.equal(meffConnectionWidth, '9',
    'SVG export should preserve an explicitly imported MEFF connection width');

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
