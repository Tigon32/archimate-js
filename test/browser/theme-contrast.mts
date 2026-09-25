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

async function checkForcedColors(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active' });
  assert.equal(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), true,
    'forced-colors media feature did not become active');
  const system = await page.evaluate(() => {
    const resolve = (value: string): string => {
      const probe = document.createElement('span');
      probe.style.color = value;
      probe.style.setProperty('forced-color-adjust', 'none');
      const shell = document.querySelector('.am-app');
      if (!shell) throw new Error('Missing app shell');
      shell.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    return { canvasText: resolve('CanvasText'), buttonText: resolve('ButtonText'), highlight: resolve('Highlight') };
  });
  const shellText = await style(page, 'h1');
  const field = await style(page, '#theme-choice');
  const button = await style(page, '.am-ui-button');
  assert.equal(shellText.color, system.canvasText, 'shell text did not use CanvasText');
  assert.equal(field.color, system.buttonText, 'field text did not use ButtonText');
  assert.equal(field.border, system.buttonText, 'field border did not use ButtonText');
  assert.equal(button.color, system.buttonText, 'button text did not use ButtonText');
  const border = await page.locator('#theme-choice').evaluate((element) => {
    const css = getComputedStyle(element);
    return { width: parseFloat(css.borderTopWidth), style: css.borderTopStyle };
  });
  assert.ok(border.width > 0 && border.style !== 'none', 'forced-colors control border is not visible');

  await page.mouse.move(0, 0);
  await page.locator('#theme-choice').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.ok(await page.locator('#theme-choice').evaluate((element) => element.matches(':focus-visible')),
    'forced-colors field is not keyboard-focus visible');
  const focused = await style(page, '#theme-choice');
  assert.ok(parseFloat(focused.outlineWidth) > 0, 'forced-colors focus outline is missing');
  assert.equal(focused.outline, system.highlight, 'forced-colors focus outline did not use Highlight');

  const adjustments = await page.evaluate(() => ['.am-app', '#theme-choice', '.am-ui-button'].map((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return getComputedStyle(element).forcedColorAdjust;
  }));
  assert.ok(adjustments.every((value) => value !== 'none'),
    'app shell suppresses forced-color adjustment');
}

async function readShellLayout(page: Page) {
  return page.evaluate(() => {
    const selectors = ['h1', '.am-app > p:not(.am-ui-status)', 'label[for="theme-choice"]',
      '#theme-choice', '.am-ui-button', '#status', '.diagram-frame'];
    const textSelectors = selectors.slice(0, 3).concat(['.am-ui-button', '#status']);
    return {
      viewport: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      controls: selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const rect = element.getBoundingClientRect();
        return { selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
          width: rect.width, height: rect.height };
      }),
      text: textSelectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const range = document.createRange();
        range.selectNodeContents(element);
        return { selector, value: element.textContent?.trim(), rects: Array.from(range.getClientRects()).map(
          (rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            width: rect.width, height: rect.height })) };
      }),
      chooser: (() => {
        const element = document.querySelector('#theme-choice');
        if (!(element instanceof HTMLSelectElement)) throw new Error('Missing theme chooser');
        return { value: element.value, name: element.getAttribute('aria-label'),
          selected: element.selectedOptions[0]?.textContent?.trim() };
      })(),
      diagram: (() => {
        const frame = document.querySelector('.diagram-frame');
        if (!frame) throw new Error('Missing diagram frame');
        return { scrollWidth: frame.scrollWidth, clientWidth: frame.clientWidth };
      })()
    };
  });
}

async function checkShellLayout(page: Page, mode: string, scenario: string): Promise<void> {
  const layout = await readShellLayout(page);
  assert.ok(layout.pageWidth <= layout.viewport + 1,
    `${mode} ${scenario}: page overflows horizontally (${layout.pageWidth}px > ${layout.viewport}px)`);
  for (const item of layout.controls) {
    assert.ok(item.left >= -1 && item.right <= layout.viewport + 1 && item.width > 0 && item.height > 0,
      `${mode} ${scenario}: ${item.selector} is clipped or missing`);
  }
  for (let first = 0; first < layout.controls.length; first++) {
    for (const second of layout.controls.slice(first + 1)) {
      const item = layout.controls[first];
      assert.ok(item.right <= second.left + 1 || second.right <= item.left + 1 ||
        item.bottom <= second.top + 1 || second.bottom <= item.top + 1,
      `${mode} ${scenario}: ${item.selector} overlaps ${second.selector}`);
    }
  }
  for (const item of layout.text) {
    const box = layout.controls.find((control) => control.selector === item.selector);
    assert.ok(box && item.value && item.rects.length, `${mode} ${scenario}: ${item.selector} text is missing`);
    for (const rect of item.rects) {
      assert.ok(rect.width > 0 && rect.height > 0 && rect.left >= box.left - 1 &&
        rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1,
      `${mode} ${scenario}: ${item.selector} text escapes its box`);
    }
  }
  assert.ok(layout.chooser.value && layout.chooser.selected &&
    layout.chooser.name?.includes(layout.chooser.selected),
  `${mode} ${scenario}: selected theme has no accessible name`);
  if (scenario === '320px reflow') {
    assert.ok(layout.diagram.scrollWidth > layout.diagram.clientWidth,
      `${mode}: spatial diagram is not independently pannable`);
  }
}

async function checkResizeAndReflow(page: Page): Promise<void> {
  const chooser = page.locator('#theme-choice');
  const textSelectors = ['h1', '.am-app > p:not(.am-ui-status)', 'label[for="theme-choice"]',
    '#theme-choice', '.am-ui-button', '#status'];
  for (const choice of ['default', 'light', 'dark', 'high-contrast-light', 'high-contrast-dark']) {
    await chooser.selectOption(choice);
    await page.setViewportSize({ width: 1280, height: 800 });
    const baseline = await page.evaluate((selectors) => selectors.map((selector) =>
      parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize)), textSelectors);
    await page.locator('html').evaluate((element) => { element.style.fontSize = '200%'; });
    const resized = await page.evaluate((selectors) => selectors.map((selector) =>
      parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize)), textSelectors);
    for (let index = 0; index < textSelectors.length; index++) {
      assert.ok(resized[index] >= baseline[index] * 1.95 && resized[index] <= baseline[index] * 2.05,
        `${choice}: ${textSelectors[index]} did not double at 200% text resize`);
    }
    await checkShellLayout(page, choice, '200% text resize');
    await page.locator('html').evaluate((element) => { element.style.fontSize = ''; });

    await page.setViewportSize({ width: 320, height: 800 });
    await checkShellLayout(page, choice, '320px reflow');
    const override = await page.addStyleTag({ content: '.am-app * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } .am-app p { margin-bottom: 2em !important; }' });
    const spacing = await page.locator('.am-app > p:not(.am-ui-status)').evaluate((element) => {
      const css = getComputedStyle(element);
      return { font: parseFloat(css.fontSize), line: parseFloat(css.lineHeight),
        letter: parseFloat(css.letterSpacing), word: parseFloat(css.wordSpacing),
        paragraph: parseFloat(css.marginBottom) };
    });
    assert.ok(spacing.line >= spacing.font * 1.5 && spacing.letter >= spacing.font * 0.12 - 0.01 &&
      spacing.word >= spacing.font * 0.16 - 0.01 && spacing.paragraph >= spacing.font * 2,
    `${choice}: text spacing override did not engage`);
    await checkShellLayout(page, choice, '320px text spacing');
    await override.evaluate((element) => element.parentNode?.removeChild(element));
  }
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
  await checkForcedColors(page);
  await checkResizeAndReflow(page);
  console.log(JSON.stringify({ browser: 'Chromium', platform: process.platform, matrix }));
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
