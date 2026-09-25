// SYNTHETIC: Exercises the public viewer with the checked-in synthetic MEFF fixture.
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { createServer } from 'node:http';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import path from 'node:path';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = new Map([
  ['/viewer.js', ['.ci-build/archimate-js.js', 'text/javascript; charset=utf-8']],
  ['/diagram.css', ['node_modules/diagram-js/assets/diagram-js.css', 'text/css; charset=utf-8']],
  ['/synthetic.xml', ['test/fixtures/synthetic/dto-export-view.xml', 'application/xml; charset=utf-8']]
]);

const server = createServer((request: { url?: string }, response: {
  setHeader(name: string, value: string): void;
  writeHead(status: number): { end(body?: string | Uint8Array): void };
}) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    return void response.writeHead(200).end(
      '<!doctype html><html><head><link rel="stylesheet" href="/diagram.css"></head><body><script src="/viewer.js"></script></body></html>'
    );
  }
  const route = files.get(pathname);
  if (!route) return void response.writeHead(404).end();
  response.setHeader('content-type', route[1]);
  response.writeHead(200).end(readFileSync(path.join(root, route[0])));
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const api = (window as unknown as { ArchimateJS: {
      mountViewer(options: { xml: string; container: HTMLElement }): Promise<{
        get(name: string): { viewbox(): { x: number; y: number; scale: number }; focus(): void };
        destroy(): void;
      }>;
    } }).ArchimateJS;
    const xml = await (await fetch('/synthetic.xml')).text();
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '500px';
    document.body.append(container);
    const viewer = await api.mountViewer({ xml, container });
    const canvas = viewer.get('canvas');
    canvas.focus();
  });

  const canvasBox = await page.locator('.djs-container > svg').boundingBox();
  if (!canvasBox) throw new Error('Viewer SVG should be mounted.');
  const beforePan = await page.locator('.djs-container .viewport').getAttribute('transform');
  await page.mouse.move(canvasBox.x + canvasBox.width - 16, canvasBox.y + canvasBox.height - 16);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width - 52, canvasBox.y + canvasBox.height - 38);
  await page.mouse.up();
  const afterPan = await page.locator('.djs-container .viewport').getAttribute('transform');
  assert.notEqual(afterPan, beforePan, 'mouse drag should pan the canvas');

  const beforeZoom = await page.locator('.djs-container .viewport').getAttribute('transform');
  await page.mouse.wheel(0, -120);
  const afterWheel = await page.locator('.djs-container .viewport').getAttribute('transform');
  assert.notEqual(afterWheel, beforeZoom, 'mouse or trackpad wheel should pan the canvas');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  const afterZoom = await page.locator('.djs-container .viewport').getAttribute('transform');
  assert.notEqual(afterZoom, afterWheel, 'Ctrl-wheel should zoom the canvas');

  await page.locator('[data-element-id="node-component"] .djs-hit').click();
  await page.locator('[data-element-id="node-component"].selected').waitFor();
  await page.keyboard.down('Shift');
  await page.locator('[data-element-id="node-service"] .djs-hit').click();
  await page.keyboard.up('Shift');
  await page.locator('[data-element-id="node-service"].selected').waitFor();
  const selected = await page.locator('.djs-element.selected').count();
  assert.equal(selected, 2, 'Shift-click should retain both selected elements');
  assert.ok(await page.locator('[data-element-id="node-component"] .djs-outline').count(),
    'selected shapes should retain visible diagram-js outlines');
  assert.ok(await page.locator('[data-element-id="node-service"] .djs-outline').count(),
    'every selected shape should retain a visible outline');

  console.log('diagram-js 15 viewer core browser checks passed');
} finally {
  if (browser) await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
