// SYNTHETIC provenance: the DTO export fixture is hand-authored from public MEFF schema descriptions.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = '/test/fixtures/synthetic/dto-export-view.xml';
const routes = new Map<string, [string, string]>([
  ['/examples/read-only/', ['examples/read-only/index.html', 'text/html; charset=utf-8']],
  ['/examples/read-only/viewer.js', ['examples/read-only/viewer.js', 'text/javascript; charset=utf-8']],
  ['/examples/read-only/outline-bridge.js', ['examples/read-only/outline-bridge.js', 'text/javascript; charset=utf-8']],
  ['/examples/read-only/theme.js', ['examples/read-only/theme.js', 'text/javascript; charset=utf-8']],
  ['/examples/read-only/diagram.css', ['examples/read-only/diagram.css', 'text/css; charset=utf-8']],
  ['/assets/design-tokens/app-shell.css', ['assets/design-tokens/app-shell.css', 'text/css; charset=utf-8']],
  ['/assets/design-tokens/app.generated.css', ['assets/design-tokens/app.generated.css', 'text/css; charset=utf-8']],
  ['/assets/ibm-plex-font/IBMPlexSans-Regular.ttf', ['assets/ibm-plex-font/IBMPlexSans-Regular.ttf', 'font/ttf']],
  ['/assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', ['assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', 'font/ttf']],
  ['/node_modules/diagram-js/assets/diagram-js.css', ['node_modules/diagram-js/assets/diagram-js.css', 'text/css; charset=utf-8']],
  ['/.ci-build/archimate-js.js', ['.ci-build/archimate-js.js', 'text/javascript; charset=utf-8']],
  ['/.ci-build/model-dto.js', ['.ci-build/model-dto.js', 'text/javascript; charset=utf-8']],
  ['/test/fixtures/synthetic/read-only-showcase-outline-meff.xml',
    ['test/fixtures/synthetic/read-only-showcase-outline-meff.xml', 'application/xml; charset=utf-8']],
  [fixturePath, ['test/fixtures/synthetic/dto-export-view.xml', 'application/xml; charset=utf-8']]
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const route = routes.get(pathname);
  if (!route) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', route[1]);
  createReadStream(path.join(root, route[0])).pipe(response);
});
const address = await new Promise<{ port: number }>((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address() as { port: number }));
});
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/examples/read-only/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#status[data-state="success"]').waitFor();
  const xml = await page.evaluate(async (url) => (await fetch(url)).text(), fixturePath);
  const outputs: string[] = [];
  const diagramMarkup: string[] = [];

  for (const theme of ['default', 'light', 'dark', 'high-contrast-light', 'high-contrast-dark']) {
    await page.locator('#theme-choice').selectOption(theme);
    const effectiveTheme = theme === 'default'
      ? await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    assert.equal(await page.locator('.am-app').getAttribute('data-theme'), effectiveTheme,
      `${theme} should be applied by the example theme selector`);
    diagramMarkup.push(await page.locator('#diagram svg.am-diagram').evaluate((svg) => svg.innerHTML));
    outputs.push(await page.evaluate(async ({ xml: fixture, viewId }) => {
      const browser = window as unknown as { ArchimateJS?: {
        renderViewToSvg(options: {
          xml: string; viewId: string; width: number; height: number
        }): Promise<string>;
      } };
      const api = browser.ArchimateJS;
      if (!api) throw new Error('Public ArchimateJS browser API is unavailable.');
      return api.renderViewToSvg({ xml: fixture, viewId, width: 1024, height: 768 });
    }, { xml, viewId: 'view-dto-export' }));
  }

  assert.ok(diagramMarkup[0].includes('stroke'), 'rendered diagram should preserve SVG authored stroke attributes');
  assert.match(outputs[0], /stroke:\s*rgba\(20,\s*40,\s*60,\s*0\.49[0-9]*\);\s*stroke-width:\s*7/i,
    'export should retain the synthetic fixture’s authored line color and width');
  for (const markup of diagramMarkup.slice(1)) {
    assert.equal(markup, diagramMarkup[0], 'changing the app theme must not rewrite rendered diagram styling');
  }
  for (const output of outputs.slice(1)) {
    assert.equal(output, outputs[0], 'exported SVG must be byte-identical across app UI themes');
  }
  console.log('theme/export invariance browser test passed for five themes');
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
