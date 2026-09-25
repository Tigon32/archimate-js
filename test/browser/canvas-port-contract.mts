// SYNTHETIC: Runs the shared CanvasPort contract against DiagramJsCanvasPort in Chromium.
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { createReadStream } from 'node:fs';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { copyFile, unlink } from 'node:fs/promises';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { createServer } from 'node:http';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import path from 'node:path';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/canvas-port-contract-entry.generated.js');

async function runWebpack(entry: string, filename: string, library?: { name: string; type: 'umd' }): Promise<void> {
  const compiler = webpack({ mode: 'development', target: 'web', entry,
    output: { path: path.join(root, '.ci-build'), filename, ...(library ? { library } : {}) },
    module: { rules: [{ test: /\.(css|svg|ttf|woff2?)$/, type: 'asset/inline' }] },
    resolve: { extensions: ['.ts', '.mts', '.js', '.json'] }, stats: 'errors-warnings' });
  const stats = await new Promise<import('webpack').Stats>((resolve, reject) => {
    compiler.run((error, result) => compiler.close((closeError) => {
      if (error || closeError || !result) reject(error || closeError || new Error('Browser compile failed.'));
      else resolve(result);
    }));
  });
  assert.equal(stats.hasErrors(), false, JSON.stringify(stats.toJson({ all: false, errors: true }).errors));
}

async function compileEntry(): Promise<void> {
  await copyFile(path.join(root, 'test/browser/canvas-port-contract-entry.ts'), entryPath);
  try {
    await runWebpack(entryPath, 'canvas-port-contract-test.js');
  } finally {
    await unlink(entryPath);
  }
}

async function restoreDtoBrowserBundle(): Promise<void> {
  await runWebpack(path.join(root, 'dist/model-dto/index.js'), 'model-dto.js',
    { name: 'ArchimateModelDto', type: 'umd' });
}

function serveFixture() {
  const files = new Map([
    ['/.ci-build/canvas-port-contract-test.js', '.ci-build/canvas-port-contract-test.js'],
    ['/synthetic.xml', 'test/fixtures/synthetic/dto-export-view.xml']
  ]);
  const server = createServer((request: { url?: string }, response: {
    writeHead(status: number): { end(body?: string): void }; setHeader(name: string, value: string): void;
  }) => {
    const route = new URL(request.url || '/', 'http://localhost').pathname;
    if (route === '/') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      return void response.writeHead(200).end('<!doctype html><html><body></body></html>');
    }
    const name = files.get(route);
    if (!name) return void response.writeHead(404).end();
    response.setHeader('content-type', name.endsWith('.xml') ? 'application/xml' : 'text/javascript');
    createReadStream(path.join(root, name)).pipe(response);
  });
  return server;
}

await compileEntry();
const server = serveFixture();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(origin + '/');
  await page.addScriptTag({ url: '/.ci-build/canvas-port-contract-test.js' });
  const passed = await page.evaluate(async () => {
    const api = (window as unknown as {
      CanvasPortContractTest: { runCanvasPortContract(xml: string): Promise<string[]> };
    }).CanvasPortContractTest;
    const xml = await (await fetch('/synthetic.xml')).text();
    return api.runCanvasPortContract(xml);
  });
  assert.deepEqual(passed, [
    'attaches and renders the active view projection',
    'routes gesture commands through the adapter and rerenders geometry',
    'maps selection ids from engine to adapter and back',
    'keeps model and history unchanged for rejected gestures',
    'rerenders identical projections across undo and redo',
    'detaches listeners, clears rendering, and ignores later gestures',
    'emits JSON round-trippable plain projections'
  ]);
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await restoreDtoBrowserBundle();
}
