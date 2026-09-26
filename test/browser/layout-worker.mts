// SYNTHETIC: Browser layout assertions use only programmatic layout-quality corpus data.
// @ts-expect-error Node types are excluded from the browser source project.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are excluded from the browser source project.
import { createReadStream } from 'node:fs';
// @ts-expect-error Node types are excluded from the browser source project.
import { writeFile, unlink } from 'node:fs/promises';
// @ts-expect-error Node types are excluded from the browser source project.
import { createServer } from 'node:http';
// @ts-expect-error Node types are excluded from the browser source project.
import path from 'node:path';
// @ts-expect-error Node types are excluded from the browser source project.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/layout-worker-entry.generated.js');
await writeFile(entryPath, `
  import { layoutQualityCorpus, layoutView, layoutViewInBrowser,
    renderLayoutQualitySvg } from '../../dist/layout/index.js';
  function isOk(value) {
    return Boolean(value && typeof value === 'object' && value.status === 'ok' && 'view' in value);
  }
  function diagnosticCode(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.diagnostics)) return '';
    const [first] = value.diagnostics;
    return first && typeof first === 'object' && 'code' in first ? String(first.code) : '';
  }
  async function compareCorpus(api) {
    const comparisons = [];
    for (const item of api.layoutQualityCorpus()) {
      const options = { strategy: 'builtin', ...item.options };
      const main = await api.layoutView(item.model, item.viewId, options);
      const worker = await api.layoutViewInBrowser(item.model, item.viewId, {
        ...options, execution: 'worker', timeoutMs: 5000
      });
      comparisons.push(JSON.stringify(worker) === JSON.stringify(main));
      if (isOk(main) && isOk(worker)) comparisons.push(
        api.renderLayoutQualitySvg(worker.view, item.id) ===
        api.renderLayoutQualitySvg(main.view, item.id));
    }
    return comparisons.every(Boolean);
  }
  async function runLayoutWorkerTest() {
    const api = window.ArchimateLayoutTest;
    const nativeWorker = window.Worker;
    let workerCount = 0;
    let sendFailureTerminated = false;
    window.Worker = class CountingWorker extends nativeWorker {
      constructor(url, options) {
        workerCount += 1;
        super(url, options);
      }
    };
    try {
      const [item] = api.layoutQualityCorpus();
      const allEqual = await compareCorpus(api);
      const auto = await api.layoutViewInBrowser(item.model, item.viewId, {
        strategy: 'builtin', workerThresholds: { minNodes: 0 }, timeoutMs: 5000
      });
      const cancelled = await api.layoutViewInBrowser(item.model, item.viewId, {
        strategy: 'builtin', execution: 'worker', signal: AbortSignal.abort()
      });
      const timedOut = await api.layoutViewInBrowser(item.model, item.viewId, {
        strategy: 'builtin', execution: 'worker', timeoutMs: 0
      });
      window.Worker = class MalformedWorker {
        addEventListener(type, listener) { this[type] = listener; }
        removeEventListener(type) { delete this[type]; }
        terminate() { this.terminated = true; }
        postMessage(message) {
          queueMicrotask(() => this.message?.({ data: {
            protocol: 'archimate-js.layout-worker.v1',
            id: message.id,
            ok: true,
            result: { status: 'ok' }
          } }));
        }
      };
      const malformed = await api.layoutViewInBrowser(item.model, item.viewId, {
        strategy: 'builtin', execution: 'worker', timeoutMs: 5000
      });
      window.Worker = class SendFailureWorker {
        addEventListener(type, listener) { this[type] = listener; }
        removeEventListener(type) { delete this[type]; }
        terminate() { sendFailureTerminated = true; }
        postMessage() { throw new DOMException('SYNTHETIC send failure', 'DataCloneError'); }
      };
      const sendFailure = await api.layoutViewInBrowser(item.model, item.viewId, {
        strategy: 'builtin', execution: 'worker', timeoutMs: 5000
      });
      return { allEqual, workerCount, auto: isOk(auto),
        cancelled: diagnosticCode(cancelled), timedOut: diagnosticCode(timedOut),
        malformed: diagnosticCode(malformed), sendFailure: diagnosticCode(sendFailure),
        sendFailureTerminated };
    } finally {
      window.Worker = nativeWorker;
    }
  }
  Object.assign(window, { ArchimateLayoutTest: {
    layoutQualityCorpus, layoutView, layoutViewInBrowser, renderLayoutQualitySvg,
    runLayoutWorkerTest
  } });
`);

try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: path.join(root, '.ci-build'), filename: 'layout-worker-test.js',
      publicPath: '/.ci-build/' },
    resolve: { extensions: ['.ts', '.js', '.json'] }, stats: 'errors-warnings' });
  const stats = await new Promise<import('webpack').Stats>((resolve, reject) => {
    compiler.run((error, result) => compiler.close((closeError) => {
      if (error || closeError || !result) reject(error || closeError || new Error('Browser compile failed.'));
      else resolve(result);
    }));
  });
  assert.equal(stats.hasErrors(), false, JSON.stringify(stats.toJson({ all: false, errors: true }).errors));
} finally {
  await unlink(entryPath);
}

const server = createServer((request: { url?: string }, response: {
  writeHead(status: number): { end(body?: string): void }; setHeader(name: string, value: string): void;
}) => {
  const route = new URL(request.url || '/', 'http://localhost').pathname;
  if (route === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    return void response.writeHead(200).end('<!doctype html><html><body></body></html>');
  }
  if (!route.startsWith('/.ci-build/')) return void response.writeHead(404).end();
  response.setHeader('content-type', 'text/javascript');
  createReadStream(path.join(root, route.slice(1))).pipe(response);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(origin + '/');
  await page.addScriptTag({ url: '/.ci-build/layout-worker-test.js' });
  const result = await page.evaluate(async () => {
    type LayoutApi = {
      runLayoutWorkerTest(): Promise<unknown>;
    };
    const api = (window as unknown as Window & { ArchimateLayoutTest: LayoutApi }).ArchimateLayoutTest;
    return api.runLayoutWorkerTest();
  });
  assert.deepEqual(result, {
    allEqual: true,
    workerCount: 5,
    auto: true,
    cancelled: 'LAYOUT_CANCELLED',
    timedOut: 'LAYOUT_TIMEOUT',
    malformed: 'LAYOUT_FAILED',
    sendFailure: 'LAYOUT_FAILED',
    sendFailureTerminated: true
  });
  console.log('layout worker browser test passed');
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
