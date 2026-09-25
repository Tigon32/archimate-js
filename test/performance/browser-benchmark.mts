// SYNTHETIC: Measures deterministic generated models in the public read-only example.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route
} from 'playwright-core';

import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_CONTRACT_VERSION,
  PERFORMANCE_HARD_LIMITS,
  PERFORMANCE_TIERS,
  artifactMetadata,
  classifyPerformance,
  summarizeSamples,
  type PerformanceTier
} from './performance-contract.mts';
import { createSyntheticModel } from './synthetic-model.mts';

declare global {
  interface Window { __syntheticRenderMs?: number }
}

type Structure = { shapes: number; connections: number; text: number };
type PageState = Structure & {
  durationMs: number | undefined;
  status: string | null | undefined;
  statusText: string | null | undefined;
};
type FixtureServer = {
  server: Server;
  setFixture(xml: string): void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoute = '/test/fixtures/synthetic/read-only-showcase-outline-meff.xml';
const routes = new Map<string, [string, string]>([
  ['/examples/read-only/', ['examples/read-only/index.html', 'text/html; charset=utf-8']],
  ['/examples/read-only/viewer.js', ['examples/read-only/viewer.js', 'text/javascript; charset=utf-8']],
  ['/examples/read-only/outline-bridge.js', ['examples/read-only/outline-bridge.js',
    'text/javascript; charset=utf-8']],
  ['/examples/read-only/theme.js', ['examples/read-only/theme.js', 'text/javascript; charset=utf-8']],
  ['/examples/read-only/diagram.css', ['examples/read-only/diagram.css', 'text/css; charset=utf-8']],
  ['/assets/design-tokens/app-shell.css', ['assets/design-tokens/app-shell.css', 'text/css; charset=utf-8']],
  ['/assets/design-tokens/app.generated.css', ['assets/design-tokens/app.generated.css', 'text/css; charset=utf-8']],
  ['/assets/ibm-plex-font/IBMPlexSans-Regular.ttf', ['assets/ibm-plex-font/IBMPlexSans-Regular.ttf', 'font/ttf']],
  ['/assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', ['assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', 'font/ttf']],
  ['/node_modules/diagram-js/assets/diagram-js.css', ['node_modules/diagram-js/assets/diagram-js.css', 'text/css; charset=utf-8']],
  ['/.ci-build/archimate-js.js', ['.ci-build/archimate-js.js', 'text/javascript; charset=utf-8']],
  ['/.ci-build/model-dto.js', ['.ci-build/model-dto.js', 'text/javascript; charset=utf-8']]
]);

function createFixtureServer(): FixtureServer {
  let fixtureXml = '';
  const server = createServer((request, response) => {
    const requestPath = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (requestPath === fixtureRoute) {
      response.setHeader('content-type', 'application/xml; charset=utf-8');
      response.end(fixtureXml);
      return;
    }
    const route = routes.get(requestPath);
    if (!route) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', route[1]);
    createReadStream(path.join(root, route[0])).pipe(response);
  });
  return { server, setFixture: (xml) => { fixtureXml = xml; } };
}

async function observeRender(page: Page, expected: Structure): Promise<void> {
  await page.addInitScript((minimum) => {
    const started = performance.now();
    const observer = new MutationObserver(() => {
      const status = document.querySelector('#status');
      const shapes = document.querySelectorAll('#diagram .djs-shape').length;
      const connections = document.querySelectorAll('#diagram .djs-connection').length;
      const text = document.querySelectorAll('#diagram svg text').length;
      if (status?.getAttribute('data-state') === 'success' &&
          shapes >= minimum.shapes && connections >= minimum.connections &&
          text >= minimum.text) {
        window.__syntheticRenderMs = performance.now() - started;
        observer.disconnect();
      }
    });
    observer.observe(document, { subtree: true, attributes: true, childList: true });
  }, expected);
}

async function readPageState(page: Page): Promise<PageState> {
  return page.evaluate(() => ({
    durationMs: window.__syntheticRenderMs,
    status: document.querySelector('#status')?.getAttribute('data-state'),
    statusText: document.querySelector('#status')?.textContent,
    shapes: document.querySelectorAll('#diagram .djs-shape').length,
    connections: document.querySelectorAll('#diagram .djs-connection').length,
    text: document.querySelectorAll('#diagram svg text').length
  }));
}

async function preparePage(context: BrowserContext, origin: string) {
  let offOriginRequests = 0;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  await context.route('**/*', (route: Route) => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    offOriginRequests += 1;
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => { pageErrors.push(error.message); });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { page, pageErrors, consoleErrors, offOriginRequests: () => offOriginRequests };
}

async function measureOnce(
  browser: Browser,
  origin: string,
  expected: Structure
): Promise<{ durationMs: number; structure: Structure }> {
  const context: BrowserContext = await browser.newContext({ colorScheme: 'light' });
  try {
    const prepared = await preparePage(context, origin);
    const { page, pageErrors, consoleErrors } = prepared;
    await observeRender(page, expected);
    await page.goto(origin + '/examples/read-only/', { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(
        () => Number.isFinite(window.__syntheticRenderMs),
        null,
        { timeout: 30000 }
      );
    } catch (error) {
      const state = await readPageState(page);
      throw new Error(`Browser render did not complete: ${JSON.stringify({
        state,
        pageErrors,
        consoleErrors
      })}`, {
        cause: error
      });
    }
    const measured = await readPageState(page);
    assert.equal(measured.status, 'success');
    assert.deepEqual(
      { shapes: measured.shapes, connections: measured.connections, text: measured.text },
      expected
    );
    assert.equal(prepared.offOriginRequests(), 0);
    assert.deepEqual(pageErrors, []);
    assert.equal(typeof measured.durationMs, 'number');
    return { durationMs: measured.durationMs as number, structure: expected };
  } finally {
    await context.close();
  }
}

async function measureTier(
  browser: Browser,
  origin: string,
  fixtureServer: FixtureServer,
  tier: PerformanceTier,
  repeats: number
) {
  const model = createSyntheticModel(tier);
  fixtureServer.setFixture(model.xml);
  const expected = {
    shapes: model.nodeCount * 2,
    connections: model.connectionCount,
    text: model.nodeCount
  };
  const samples: number[] = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    samples.push((await measureOnce(browser, origin, expected)).durationMs);
  }
  const summary = summarizeSamples(samples);
  return {
    tier,
    fixtureFingerprint: createHash('sha256').update(model.xml).digest('hex'),
    fixture: {
      provenance: model.provenance,
      elementCount: model.elementCount,
      relationshipCount: model.relationshipCount,
      xmlBytes: Buffer.byteLength(model.xml)
    },
    repeats,
    measurement: {
      ...summary,
      ...classifyPerformance(summary.medianMs, summary.toleranceMs, {
        budgetMs: PERFORMANCE_BUDGETS.browser[tier.name],
        hardLimitMs: PERFORMANCE_HARD_LIMITS.browser[tier.name]
      })
    },
    structure: expected
  };
}

type BrowserBenchmark = Awaited<ReturnType<typeof measureTier>>;

function createResult(browser: Browser, benchmarks: BrowserBenchmark[], repeats: number) {
  const browserMajor = browser.version().split('.')[0];
  return {
    schemaVersion: 2,
    contractVersion: PERFORMANCE_CONTRACT_VERSION,
    provenance: 'SYNTHETIC',
    artifact: artifactMetadata(
      'browser',
      `chromium-${browserMajor}-${process.platform}-${process.arch}`
    ),
    measure: 'navigation-init-to-rendered-svg',
    environment: {
      browser: 'chromium',
      browserVersion: browser.version(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: cpus().length,
      ci: process.env.CI === 'true'
    },
    options: { tiers: PERFORMANCE_TIERS, repeats },
    benchmarks
  };
}

async function emitResult(result: ReturnType<typeof createResult>, output: string | undefined) {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (output) {
    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await writeFile(output, json, { flag: 'w' });
  }
  process.stdout.write(json);
}

async function run(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const output = process.argv.find((argument) => argument.startsWith('--output='))?.slice(9);
  const repeatsArgument = process.argv.find((argument) => argument.startsWith('--repeats='));
  const repeats = repeatsArgument ? Number(repeatsArgument.slice(10)) : 3;
  const fixtureServer = createFixtureServer();
  await new Promise<void>((resolve) => fixtureServer.server.listen(0, '127.0.0.1', resolve));
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_BIN || undefined,
      headless: true,
      args: [ '--no-sandbox', '--disable-setuid-sandbox' ]
    });
    const address = fixtureServer.server.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;
    const benchmarks = [];
    for (const tier of PERFORMANCE_TIERS) {
      benchmarks.push(await measureTier(browser, origin, fixtureServer, tier, repeats));
    }
    const result = createResult(browser, benchmarks, repeats);
    await emitResult(result, output);
    if (args.has('--assert') &&
        benchmarks.some(({ measurement }) => measurement.hardLimitStatus === 'exceeded')) {
      throw new Error('Browser performance hard limit exceeded');
    }
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => fixtureServer.server.close(() => resolve()));
  }
}

await run();
