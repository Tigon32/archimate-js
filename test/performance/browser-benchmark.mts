// SYNTHETIC: Measures only the repository's public-safe read-only showcase.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright-core';

declare global {
  interface Window { __syntheticRenderMs?: number }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = 'test/fixtures/synthetic/read-only-showcase.xml';
const routes = new Map<string, [string, string]>([
  ['/examples/read-only/', ['examples/read-only/index.html', 'text/html; charset=utf-8']],
  ['/examples/read-only/viewer.js', ['examples/read-only/viewer.js', 'text/javascript; charset=utf-8']],
  ['/examples/read-only/theme.js', ['examples/read-only/theme.js', 'text/javascript; charset=utf-8']],
  ['/examples/read-only/diagram.css', ['examples/read-only/diagram.css', 'text/css; charset=utf-8']],
  ['/assets/design-tokens/app-shell.css', ['assets/design-tokens/app-shell.css', 'text/css; charset=utf-8']],
  ['/assets/design-tokens/app.generated.css', ['assets/design-tokens/app.generated.css', 'text/css; charset=utf-8']],
  ['/assets/ibm-plex-font/IBMPlexSans-Regular.ttf', ['assets/ibm-plex-font/IBMPlexSans-Regular.ttf', 'font/ttf']],
  ['/assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', ['assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', 'font/ttf']],
  ['/node_modules/diagram-js/assets/diagram-js.css', ['node_modules/diagram-js/assets/diagram-js.css', 'text/css; charset=utf-8']],
  ['/.ci-build/archimate-js.js', ['.ci-build/archimate-js.js', 'text/javascript; charset=utf-8']],
  ['/test/fixtures/synthetic/read-only-showcase.xml', [fixturePath, 'application/xml; charset=utf-8']]
]);

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted[middle];
}

function createFixtureServer() {
  return createServer((request, response) => {
    const route = routes.get(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (!route) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', route[1]);
    createReadStream(path.join(root, route[0])).pipe(response);
  });
}

async function observeRender(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const started = performance.now();
    const observer = new MutationObserver(() => {
      const status = document.querySelector('#status');
      const diagram = document.querySelector('#diagram svg.am-diagram');
      if (status?.getAttribute('data-state') === 'success' && diagram &&
          document.querySelectorAll('#diagram .djs-shape').length >= 5 &&
          document.querySelectorAll('#diagram .djs-connection').length >= 4) {
        window.__syntheticRenderMs = performance.now() - started;
        observer.disconnect();
      }
    });
    observer.observe(document, { subtree: true, attributes: true, childList: true });
  });
}

type Structure = { shapes: number; connections: number; text: number };

async function measureOnce(browser: Browser, origin: string): Promise<{ durationMs: number; structure: Structure }> {
  const context: BrowserContext = await browser.newContext({ colorScheme: 'light' });
  try {
    let offOriginRequests = 0;
    let pageErrors = 0;
    await context.route('**/*', (route: Route) => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      offOriginRequests += 1;
      return route.abort();
    });
    const page: Page = await context.newPage();
    page.on('pageerror', () => { pageErrors += 1; });
    await observeRender(page);
    await page.goto(origin + '/examples/read-only/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Number.isFinite(window.__syntheticRenderMs), null, { timeout: 15000 });
    const measured: { durationMs: number | undefined; status: string | null | undefined;
      shapes: number; connections: number; text: number } = await page.evaluate(() => ({
      durationMs: window.__syntheticRenderMs,
      status: document.querySelector('#status')?.getAttribute('data-state'),
      shapes: document.querySelectorAll('#diagram .djs-shape').length,
      connections: document.querySelectorAll('#diagram .djs-connection').length,
      text: document.querySelectorAll('#diagram svg text').length
    }));
    assert.equal(measured.status, 'success');
    assert.ok(measured.shapes >= 5 && measured.connections >= 4 && measured.text >= 5);
    if (typeof measured.durationMs !== 'number' || !Number.isFinite(measured.durationMs) || measured.durationMs < 0) {
      throw new Error('Browser timing is missing or invalid');
    }
    assert.equal(offOriginRequests, 0);
    assert.equal(pageErrors, 0);
    return { durationMs: measured.durationMs,
      structure: { shapes: measured.shapes, connections: measured.connections, text: measured.text } };
  } finally {
    await context.close();
  }
}

async function run() {
  const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
  const fixtureSha256 = createHash('sha256').update(await readFile(path.join(root, fixturePath))).digest('hex');
  const server = createFixtureServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
      headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const samplesMs: number[] = [];
    let structure: Structure | undefined;
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const current = await measureOnce(browser, origin);
      if (structure) assert.deepEqual(current.structure, structure);
      structure = current.structure;
      samplesMs.push(current.durationMs);
    }
    const result = {
      schemaVersion: 1, provenance: 'SYNTHETIC', fixtureSha256,
      measure: 'navigation-init-to-rendered-svg',
      environment: { browser: 'chromium', browserVersion: browser.version(), node: process.version,
        platform: process.platform, arch: process.arch, cpuCount: cpus().length, ci: process.env.CI === 'true' },
      repeats: samplesMs.length, samplesMs, medianMs: median(samplesMs), structure
    };
    const json = JSON.stringify(result, null, 2) + '\n';
    if (output) {
      await mkdir(path.dirname(path.resolve(output)), { recursive: true });
      await writeFile(output, json, { flag: 'w' });
    }
    process.stdout.write(json);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

await run();
