// SYNTHETIC provenance: Chromium checks use checked-in public synthetic MEFF fixtures only.
// @ts-ignore Node types are intentionally excluded from browser-facing source.
import assert from 'node:assert/strict';
// @ts-ignore Node types are intentionally excluded from browser-facing source.
import { createReadStream } from 'node:fs';
// @ts-ignore Node types are intentionally excluded from browser-facing source.
import { writeFile, unlink } from 'node:fs/promises';
// @ts-ignore Node types are intentionally excluded from browser-facing source.
import { createServer } from 'node:http';
// @ts-ignore Node types are intentionally excluded from browser-facing source.
import path from 'node:path';
// @ts-ignore Node types are intentionally excluded from browser-facing source.
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/theme-zoom.generated.js');
const themes = ['default', 'light', 'dark', 'high-contrast-light', 'high-contrast-dark'] as const;

await writeFile(entryPath, `
  import Modeler from '../../dist/modeler/index.js';
  Object.assign(window, { ThemeZoomTest: { Modeler } });
`);

try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: path.join(root, '.ci-build'), filename: 'theme-zoom-test.js' },
    module: { rules: [{ test: /\\.(css|svg|ttf|woff2?)$/, type: 'asset/inline' }] },
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

const routes = new Map<string, [string, string]>([
  ['/.ci-build/theme-zoom-test.js', ['.ci-build/theme-zoom-test.js', 'text/javascript; charset=utf-8']],
  ['/synthetic.xml', ['test/fixtures/synthetic/dto-export-view.xml', 'application/xml; charset=utf-8']],
  ['/assets/design-tokens/app-shell.css', ['assets/design-tokens/app-shell.css', 'text/css; charset=utf-8']],
  ['/assets/design-tokens/app.generated.css', ['assets/design-tokens/app.generated.css', 'text/css; charset=utf-8']],
  ['/assets/ibm-plex-font/IBMPlexSans-Regular.ttf', ['assets/ibm-plex-font/IBMPlexSans-Regular.ttf', 'font/ttf']],
  ['/assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', ['assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', 'font/ttf']],
  ['/node_modules/diagram-js/assets/diagram-js.css', ['node_modules/diagram-js/assets/diagram-js.css',
    'text/css; charset=utf-8']]
]);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Theme zoom test</title>
<link rel="stylesheet" href="/assets/design-tokens/app-shell.css">
<link rel="stylesheet" href="/node_modules/diagram-js/assets/diagram-js.css">
<style>
body { margin: 0; }
.am-app { box-sizing: border-box; width: 100%; min-height: 100vh; padding: 1rem; }
.am-app *, .am-app *::before, .am-app *::after { box-sizing: border-box; max-width: 100%; }
.zoom-canvas { width: 100%; height: 14rem; min-height: 12rem; overflow: hidden; }
.am-ui-toolbar { align-items: stretch; }
</style></head><body><main class="am-app" data-theme="light">
<h1>Theme zoom evidence</h1>
<p class="intro">Synthetic modeler shell used to verify app controls and canvas usability at 400% zoom.</p>
<nav class="am-ui-toolbar" aria-label="Theme zoom controls">
<label for="theme-choice">Theme</label>
<select id="theme-choice" class="am-ui-field">
<option value="default">Default</option><option value="light">Light</option><option value="dark">Dark</option>
<option value="high-contrast-light">High contrast light</option>
<option value="high-contrast-dark">High contrast dark</option></select>
<button id="fit-button" class="am-ui-button" type="button">Fit view</button></nav>
<p id="status" class="am-ui-status" data-state="success" role="status">Synthetic model loaded.</p>
<section id="modeler-panel" class="am-ui-panel" aria-labelledby="modeler-title">
<h2 id="modeler-title">Interactive modeler canvas</h2><div id="canvas" class="zoom-canvas"></div></section>
</main></body></html>`;

function serveFixture() {
  return createServer((request: { url?: string }, response: any) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(html);
      return;
    }
    const route = routes.get(pathname);
    if (!route) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', route[1]);
    createReadStream(path.join(root, route[0])).pipe(response);
  });
}

async function applyZoomEquivalent(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 320, height: 900, deviceScaleFactor: 4, mobile: false, scale: 1
  });
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio
  }));
  assert.deepEqual(metrics, { width: 320, height: 900, ratio: 4 });
}

async function mountModeler(page: Page, origin: string): Promise<void> {
  await page.addScriptTag({ url: '/.ci-build/theme-zoom-test.js' });
  await page.evaluate(async (fixtureUrl) => {
    const api = (window as unknown as { ThemeZoomTest: { Modeler: new(options: Record<string, unknown>) => any } })
      .ThemeZoomTest;
    const xml = await (await fetch(fixtureUrl)).text();
    const container = document.querySelector<HTMLElement>('#canvas');
    if (!container) throw new Error('Missing canvas host');
    const modeler = new api.Modeler({ container, width: container.clientWidth, height: container.clientHeight });
    await modeler.open(xml, { viewId: 'view-dto-export' });
    modeler.zoom('fit');
    (window as unknown as { themeZoomModeler: any }).themeZoomModeler = modeler;
  }, `${origin}/synthetic.xml`);
}

async function setTheme(page: Page, theme: string): Promise<string> {
  return page.evaluate((choice) => {
    const select = document.querySelector<HTMLSelectElement>('#theme-choice');
    const app = document.querySelector<HTMLElement>('.am-app');
    if (!select || !app) throw new Error('Missing theme controls');
    select.value = choice;
    const effective = choice === 'default' ? 'light' : choice;
    app.dataset.theme = effective;
    select.setAttribute('aria-label', `Theme: ${select.selectedOptions[0]?.textContent ?? choice}`);
    return effective;
  }, theme);
}

async function assertNoLoss(page: Page, theme: string): Promise<void> {
  const result = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const box = element.getBoundingClientRect();
      return { selector, text: element.textContent?.trim(), left: box.left, top: box.top,
        right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const visible = ['h1', '.intro', '#theme-choice', '#fit-button', '#status', '#modeler-panel', '#canvas', 'svg']
      .map(rect);
    const topLevel = ['h1', '.intro', '.am-ui-toolbar', '#status', '#modeler-panel'].map(rect);
    const toolbar = ['label[for="theme-choice"]', '#theme-choice', '#fit-button'].map(rect);
    return { viewport: window.innerWidth, pageWidth: document.documentElement.scrollWidth,
      visible, topLevel, toolbar };
  });
  assert.ok(result.pageWidth <= result.viewport + 1,
    `${theme}: page has horizontal overflow at 400% zoom-equivalent metrics`);
  for (const item of result.visible) {
    assert.ok(item.width > 0 && item.height > 0 && item.left >= -1 && item.right <= result.viewport + 1,
      `${theme}: ${item.selector} is clipped or missing`);
    if (!['#canvas', 'svg'].includes(item.selector)) assert.ok(item.text, `${theme}: ${item.selector} text missing`);
  }
  assertNoOverlap(theme, 'page', result.topLevel);
  assertNoOverlap(theme, 'toolbar', result.toolbar);
}

function assertNoOverlap(theme: string, group: string, boxes: Array<{
  selector: string; left: number; top: number; right: number; bottom: number;
}>): void {
  for (let index = 0; index < boxes.length; index++) {
    for (const next of boxes.slice(index + 1)) {
      const item = boxes[index];
      const separated = item.right <= next.left + 1 || next.right <= item.left + 1 ||
        item.bottom <= next.top + 1 || next.bottom <= item.top + 1;
      assert.ok(separated, `${theme}: ${group} ${item.selector} overlaps ${next.selector}`);
    }
  }
}

async function visibleDiagramIds(page: Page, requireAll: boolean): Promise<string[]> {
  return page.evaluate((allRequired) => {
    const expectedIds = ['node-component', 'node-service', 'serving-connection'];
    const host = document.querySelector<HTMLElement>('#canvas');
    if (!host) throw new Error('Missing canvas host');
    const hostBox = host.getBoundingClientRect();
    const visible: string[] = [];
    for (const id of expectedIds) {
      const element = document.querySelector<SVGGElement>(`.djs-element[data-element-id="${id}"]`);
      if (!element) {
        if (allRequired) throw new Error(`Missing rendered diagram element ${id}`);
        continue;
      }
      const box = element.getBoundingClientRect();
      const hasSize = box.width > 0 && box.height > 0;
      const intersects = box.right > Math.max(hostBox.left, 0) &&
        box.left < Math.min(hostBox.right, window.innerWidth) &&
        box.bottom > Math.max(hostBox.top, 0) &&
        box.top < Math.min(hostBox.bottom, window.innerHeight);
      if (allRequired && (!hasSize || !intersects)) throw new Error(`Diagram element ${id} is not visible`);
      if (hasSize && intersects) visible.push(id);
    }
    if (!allRequired && visible.length === 0) throw new Error('No expected diagram element remained visible');
    return visible;
  }, requireAll);
}

async function assertDiagramVisible(page: Page, theme: string, phase: string, requireAll: boolean): Promise<void> {
  const ids = (await visibleDiagramIds(page, requireAll)).sort();
  if (requireAll) assert.deepEqual(ids, ['node-component', 'node-service', 'serving-connection'],
    `${theme}: expected synthetic diagram elements are not all visible ${phase}`);
  else assert.ok(ids.length >= 1, `${theme}: no expected element remained visible ${phase}`);
}

async function exerciseWheelGestures(page: Page): Promise<{ zoomed: boolean; panned: boolean; changed: boolean }> {
  return page.evaluate(async () => {
    const modeler = (window as unknown as { themeZoomModeler: any }).themeZoomModeler;
    const canvas = modeler.getEngineCapabilities('diagram-js').get('canvas');
    const svg = document.querySelector<SVGSVGElement>('svg');
    if (!svg) throw new Error('Missing modeler svg');
    const delay = () => new Promise((resolve) => setTimeout(resolve, 20));
    canvas.viewbox({ x: 0, y: 0, width: 800, height: 500 });
    const point = () => {
      const box = svg.getBoundingClientRect();
      return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    };
    svg.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    svg.focus();
    const beforeZoom = modeler.getZoom();
    const beforeGesture = canvas.viewbox();
    svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
      deltaY: -160, ctrlKey: true, ...point() }));
    await delay();
    const afterZoom = modeler.getZoom();
    const beforePan = canvas.viewbox();
    svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
      deltaX: 8, deltaY: 6, ...point() }));
    await delay();
    const afterPan = canvas.viewbox();
    return { zoomed: afterZoom !== beforeZoom,
      panned: afterPan.x !== beforePan.x || afterPan.y !== beforePan.y,
      changed: afterPan.x !== beforeGesture.x || afterPan.y !== beforeGesture.y ||
        afterPan.width !== beforeGesture.width || afterPan.height !== beforeGesture.height };
  });
}

async function fitModeler(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const modeler = (window as unknown as { themeZoomModeler: any }).themeZoomModeler;
    modeler.fitView();
    await new Promise((resolve) => setTimeout(resolve, 20));
    return modeler.getZoom();
  });
}

async function assertCanvasUsable(page: Page, theme: string): Promise<void> {
  await assertDiagramVisible(page, theme, 'after load', true);
  const result = await exerciseWheelGestures(page);
  await assertDiagramVisible(page, theme, 'after wheel pan/zoom', false);
  const fitScale = await fitModeler(page);
  await assertDiagramVisible(page, theme, 'after fit', true);
  assert.equal(result.zoomed, true, `${theme}: wheel zoom did not change the modeler zoom`);
  assert.equal(result.panned, true, `${theme}: wheel pan did not change the modeler viewbox`);
  assert.equal(result.changed, true, `${theme}: wheel gestures did not change the modeler viewbox`);
  assert.equal(typeof fitScale, 'number', `${theme}: fit view did not return a numeric zoom`);
}

const server = serveFixture();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage({ colorScheme: 'light' });
  await applyZoomEquivalent(page);
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await mountModeler(page, origin);
  const checked: string[] = [];
  for (const theme of themes) {
    const effective = await setTheme(page, theme);
    await assertNoLoss(page, theme);
    await assertCanvasUsable(page, theme);
    checked.push(`${theme}->${effective}`);
  }
  console.log(JSON.stringify({ browser: 'Chromium', platform: process.platform,
    method: 'CDP Emulation.setDeviceMetricsOverride width=320 height=900 deviceScaleFactor=4 mobile=false',
    limitation: 'Emulates a 320 CSS-pixel viewport at DPR 4; it is automation evidence, not a manual browser UI zoom audit.',
    checked }));
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) => server.close((error: unknown) => error ? reject(error) : resolve()));
}
