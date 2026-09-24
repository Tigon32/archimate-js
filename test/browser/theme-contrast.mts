// SYNTHETIC provenance: the public read-only example uses a hand-authored synthetic model.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routes = new Map([
  ['/examples/read-only/', 'examples/read-only/index.html'],
  ['/examples/read-only/theme.js', 'examples/read-only/theme.js'],
  ['/examples/read-only/diagram.css', 'examples/read-only/diagram.css'],
  ['/node_modules/diagram-js/assets/diagram-js.css', 'node_modules/diagram-js/assets/diagram-js.css'],
  ['/assets/design-tokens/app-shell.css', 'assets/design-tokens/app-shell.css'],
  ['/assets/design-tokens/app.generated.css', 'assets/design-tokens/app.generated.css'],
  ['/assets/ibm-plex-font/IBMPlexSans-Regular.ttf', 'assets/ibm-plex-font/IBMPlexSans-Regular.ttf'],
  ['/assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf', 'assets/ibm-plex-font/IBMPlexSans-SemiBold.ttf']
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/examples/read-only/viewer.js' || pathname === '/.ci-build/archimate-js.js') {
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    response.end('// The synthetic contrast check does not render notation.');
    return;
  }
  const file = routes.get(pathname);
  if (!file) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', file.endsWith('.css') ? 'text/css' :
    file.endsWith('.html') ? 'text/html' : file.endsWith('.ttf') ? 'font/ttf' : 'text/javascript');
  createReadStream(path.join(root, file)).pipe(response);
});

type Style = { color: string; background: string; border: string; outline: string; outlineWidth: string };

async function style(page: Page, selector: string): Promise<Style> {
  return page.locator(selector).evaluate((element) => {
    const css = getComputedStyle(element);
    return { color: css.color, background: css.backgroundColor, border: css.borderTopColor,
      outline: css.outlineColor, outlineWidth: css.outlineWidth };
  });
}

function luminance(css: string): number {
  const match = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(css);
  assert.ok(match && (match[4] === undefined || Number(match[4]) === 1),
    `Expected an opaque computed RGB color, got ${css}`);
  const channels = match.slice(1, 4).map(Number);
  const linear = channels.map((value) => {
    const fraction = value / 255;
    return fraction <= 0.04045 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first: string, second: string): number {
  const [dark, light] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
}

function requireContrast(mode: string, label: string, first: string, second: string, minimum: number): number {
  const ratio = contrast(first, second);
  assert.ok(ratio >= minimum, `${mode} ${label}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
  return ratio;
}

function requireBoundary(mode: string, label: string, border: string, inside: string, outside: string): number {
  const ratio = Math.min(contrast(border, inside), contrast(border, outside));
  assert.ok(ratio >= 3, `${mode} ${label}: ${ratio.toFixed(2)}:1 is below 3:1`);
  return ratio;
}

async function measureMode(page: Page, mode: string): Promise<Record<string, number>> {
  const app = await style(page, '.am-app');
  const field = await style(page, '#theme-choice');
  const status = await style(page, '#status');
  const button = await style(page, '.am-ui-button');
  const minimum = mode.startsWith('high-contrast') ? 7 : 4.5;
  const results: Record<string, number> = {};
  for (const [label, selector, background] of [
    ['heading', 'h1', app.background], ['body', '.am-app > p:not(.am-ui-status)', app.background],
    ['label', 'label[for="theme-choice"]', app.background],
    ['status', '#status', status.background]
  ]) {
    results[label] = requireContrast(mode, label, (await style(page, selector)).color, background, minimum);
  }
  results.fieldText = requireContrast(mode, 'field text', field.color, field.background, minimum);
  results.buttonText = requireContrast(mode, 'button text', button.color, button.background, minimum);
  results.fieldBorder = requireBoundary(mode, 'field boundary', field.border, field.background, app.background);
  results.statusBorder = requireBoundary(mode, 'status boundary', status.border, status.background, app.background);
  await page.locator('.am-ui-button').hover();
  const hovered = await style(page, '.am-ui-button');
  assert.notEqual(hovered.background, button.background, `${mode} button hover style did not engage`);
  results.buttonHover = requireContrast(mode, 'button hover text', hovered.color, hovered.background, minimum);
  await page.mouse.move(0, 0);
  await page.locator('#theme-choice').evaluate((element) => element.setAttribute('aria-invalid', 'true'));
  const invalidField = await style(page, '#theme-choice');
  assert.notEqual(invalidField.background, field.background, `${mode} invalid field fill did not engage`);
  assert.notEqual(invalidField.border, field.border, `${mode} invalid field border did not engage`);
  results.invalidBorder = requireBoundary(mode, 'invalid field boundary',
    invalidField.border, invalidField.background, app.background);
  await page.locator('#theme-choice').evaluate((element) => element.removeAttribute('aria-invalid'));
  await page.locator('#theme-choice').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.ok(await page.locator('#theme-choice').evaluate((element) => element.matches(':focus-visible')),
    `${mode} field is not keyboard-focus visible`);
  const focused = await style(page, '#theme-choice');
  assert.ok(parseFloat(focused.outlineWidth) > 0, `${mode} field focus outline is missing`);
  results.focus = requireContrast(mode, 'field focus', focused.outline, app.background, 3);
  return results;
}

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
  headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
try {
  const page = await browser.newPage({ colorScheme: 'light' });
  await page.goto(`http://127.0.0.1:${address.port}/examples/read-only/`, { waitUntil: 'networkidle' });
  const chooser = page.locator('#theme-choice');
  const matrix: Record<string, Record<string, number>> = {};
  for (const preference of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: preference });
    await chooser.selectOption('default');
    assert.equal(await page.locator('.am-app').getAttribute('data-theme'), preference);
    matrix[`default/${preference}`] = await measureMode(page, preference);
  }
  for (const choice of ['light', 'dark', 'high-contrast-light', 'high-contrast-dark']) {
    await chooser.selectOption(choice);
    assert.equal(await page.locator('.am-app').getAttribute('data-theme'), choice);
    matrix[choice] = await measureMode(page, choice);
  }
  console.log(JSON.stringify({ browser: 'Chromium', platform: process.platform, matrix }));
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
