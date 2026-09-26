// SYNTHETIC: Exercises the public read-only example theme chooser with a synthetic two-view model.
import assert from 'node:assert/strict';
import { createReadStream, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

type ThemeChoice = 'default' | 'light' | 'dark' | 'high-contrast-light' | 'high-contrast-dark';
type ThemeEvent = { type: string; value: string; theme: string | undefined };

declare global {
  interface Window {
    __testViewer?: { openView(viewId: string): Promise<void> };
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exampleFixturePath = 'test/fixtures/synthetic/read-only-showcase-outline-meff.xml';
const fixturePath = 'test/fixtures/synthetic/theme-chooser-two-view-meff.xml';
const secondaryViewId = 'view-theme-secondary';
const labels: Record<ThemeChoice, string> = {
  default: 'Default (system preference)',
  light: 'Light',
  dark: 'Dark',
  'high-contrast-light': 'High contrast light',
  'high-contrast-dark': 'High contrast dark'
};
const choices = Object.keys(labels) as ThemeChoice[];
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
  ['/node_modules/diagram-js/assets/diagram-js.css', ['node_modules/diagram-js/assets/diagram-js.css',
    'text/css; charset=utf-8']],
  [`/${exampleFixturePath}`, [fixturePath, 'application/xml; charset=utf-8']]
]);

const dtoStub = 'window.ArchimateModelDto = { checkMeffEditingEligibility: () => ({ eligible: false }) };';
const viewerCapture = `
;(() => {
  const api = window.ArchimateJS;
  const original = api?.mountViewer?.bind(api);
  if (!original) throw new Error('ArchimateJS mountViewer unavailable');
  window.ArchimateJS = { ...api, mountViewer: async (options) => {
    const viewer = await original(options);
    window.__testViewer = viewer;
    return viewer;
  } };
})();`;

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/.ci-build/archimate-js.js') {
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    response.end(`${readFileSync(path.join(root, '.ci-build/archimate-js.js'), 'utf8')}\n${viewerCapture}`);
    return;
  }
  if (pathname === '/.ci-build/model-dto.js') {
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    response.end(dtoStub);
    return;
  }
  const route = routes.get(pathname);
  if (!route) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', route[1]);
  createReadStream(path.join(root, route[0])).pipe(response);
});

async function openExample(context: BrowserContext, origin: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${origin}/examples/read-only/`, { waitUntil: 'networkidle' });
  await page.locator('#status[data-state="success"]').waitFor();
  return page;
}

function durationMs(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('ms')) return Number(trimmed.slice(0, -2));
  if (trimmed.endsWith('s')) return Number(trimmed.slice(0, -1)) * 1000;
  return Number(trimmed);
}

async function installThemeEventProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const selector = document.querySelector<HTMLSelectElement>('#theme-choice');
    if (!selector) throw new Error('Missing theme chooser');
    const events: ThemeEvent[] = [];
    const record = (event: Event) => events.push({ type: event.type, value: selector.value,
      theme: document.querySelector<HTMLElement>('.am-app')?.dataset.theme });
    selector.addEventListener('input', record);
    selector.addEventListener('change', record);
    Object.assign(window, { __themeChooserEvents: events });
  });
}

async function assertSelected(page: Page, choice: ThemeChoice, expectedTheme: string): Promise<void> {
  const label = labels[choice];
  assert.equal(await page.locator('#theme-choice').inputValue(), choice, `${choice} should be selected`);
  assert.equal(await page.locator('.am-app').getAttribute('data-theme'), expectedTheme);
  const namedControls = await page.getByRole('combobox', { name: `Theme: ${label}`, exact: true }).count() +
    await page.getByRole('listbox', { name: `Theme: ${label}`, exact: true }).count();
  assert.equal(namedControls, 1);
  const option = await page.locator(`#theme-choice option[value="${choice}"]`).evaluate((node) => ({
    text: node.textContent?.trim(),
    selected: (node as HTMLOptionElement).selected
  }));
  assert.deepEqual(option, { text: label, selected: true });
}

async function assertThemeEvents(page: Page, choice: ThemeChoice, expectedTheme: string): Promise<void> {
  const events = await page.evaluate(() => (window as unknown as { __themeChooserEvents: ThemeEvent[] })
    .__themeChooserEvents.splice(0));
  assert.ok(events.some((event) => event.type === 'input' && event.value === choice),
    `${choice} did not fire an input event`);
  assert.ok(events.some((event) => event.type === 'change' && event.value === choice &&
    event.theme === expectedTheme), `${choice} did not fire a change event after applying ${expectedTheme}`);
}

function keyboardKeys(from: ThemeChoice, to: ThemeChoice): string[] {
  const graph: Record<ThemeChoice, Partial<Record<ThemeChoice, string[]>>> = {
    default: { light: ['l'], dark: ['d'], 'high-contrast-light': ['h'] },
    light: { dark: ['d'], 'high-contrast-light': ['h'] },
    dark: { default: ['d'], 'high-contrast-light': ['h'] },
    'high-contrast-light': { default: ['d'], 'high-contrast-dark': ['h'] },
    'high-contrast-dark': { 'high-contrast-light': ['h'], default: ['d'] }
  };
  const keys = graph[from][to];
  if (!keys) throw new Error(`No native select keyboard path from ${from} to ${to}`);
  return keys;
}

async function pressSelectKeys(page: Page, keys: string[]): Promise<void> {
  for (const key of keys) {
    await page.waitForTimeout(1100);
    await page.keyboard.press(key);
  }
}

async function chooseByKeyboard(page: Page, choice: ThemeChoice, from: ThemeChoice): Promise<void> {
  await page.locator('#theme-choice').focus();
  await pressSelectKeys(page, keyboardKeys(from, choice));
  await page.locator('#theme-choice').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#theme-choice').inputValue(), choice);
}

async function chooseByPointer(page: Page, choice: ThemeChoice): Promise<void> {
  const pointerCount = await page.evaluate((value) => {
    const selector = document.querySelector<HTMLSelectElement>('#theme-choice');
    if (!selector) throw new Error('Missing theme chooser');
    selector.size = 5;
    const option = selector.querySelector<HTMLOptionElement>(`option[value="${CSS.escape(value)}"]`);
    if (!option) throw new Error('Missing theme option');
    let count = 0;
    option.addEventListener('pointerdown', () => { count++; }, { once: true });
    Object.assign(window, { __themeChooserPointerCount: () => count });
    return count;
  }, choice);
  assert.equal(pointerCount, 0);
  await page.locator(`#theme-choice option[value="${choice}"]`).click();
  assert.equal(await page.evaluate(() => (window as unknown as {
    __themeChooserPointerCount: () => number
  }).__themeChooserPointerCount()), 1);
}

async function assertFocusOrder(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const order: string[] = [];
  for (let tab = 0; tab < 4; tab++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const element = document.activeElement;
      if (!element) return '';
      if (element.id) return element.id;
      if (element.classList.contains('am-diagram')) return 'am-diagram';
      return element.textContent?.trim() || '';
    }));
  }
  assert.deepEqual(order, ['theme-choice', 'Go to diagram', 'am-diagram', 'outline-search']);
}

async function assertReducedMotion(page: Page): Promise<void> {
  const measurements = await page.evaluate(() => {
    const selectors = ['#theme-choice', '.am-ui-button', '#status', '.am-ui-toolbar'];
    return selectors.flatMap((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing app-shell control ${selector}`);
      return ['', '::before', '::after'].map((pseudo) => {
        const css = getComputedStyle(element, pseudo || undefined);
        return { selector: `${selector}${pseudo}`, transition: css.transitionDuration,
          animation: css.animationDuration };
      });
    });
  });
  for (const item of measurements) {
    const durations = [...item.transition.split(','), ...item.animation.split(',')].map(durationMs);
    assert.ok(durations.every((duration) => duration <= 0.02),
      `${item.selector} motion durations were not effectively zero: ${durations.join(', ')}`);
  }
}

async function assertStatusNotColorOnly(page: Page): Promise<void> {
  const states = await page.evaluate(() => ['success', 'warning', 'error'].map((state) => {
    const status = document.querySelector<HTMLElement>('#status');
    if (!status) throw new Error('Missing status element');
    status.dataset.state = state;
    status.textContent = `${state} synthetic status`;
    return { state, text: status.textContent, marker: getComputedStyle(status, '::before').content };
  }));
  for (const state of states) {
    assert.ok(state.text.includes(state.state), `${state.state} status lacks visible text`);
    assert.notEqual(state.marker, 'none', `${state.state} status lacks non-color marker`);
    assert.notEqual(state.marker, '""', `${state.state} status marker is empty`);
  }
}

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
  headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

try {
  const context = await browser.newContext({ colorScheme: 'light' });
  const page = await openExample(context, origin);
  await installThemeEventProbe(page);
  await page.locator('.djs-element[data-element-id="view-customer"]').waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.__testViewer)), true);
  await assertFocusOrder(page);
  let current: ThemeChoice = 'default';
  for (const choice of ['light', 'dark', 'default', 'high-contrast-light', 'high-contrast-dark'] as ThemeChoice[]) {
    await chooseByKeyboard(page, choice, current);
    const expectedTheme = choice === 'default' ? 'light' : choice;
    await assertThemeEvents(page, choice, expectedTheme);
    await assertSelected(page, choice, expectedTheme);
    current = choice;
  }
  for (const choice of ['high-contrast-light', 'default', 'light', 'dark', 'high-contrast-light',
    'high-contrast-dark'] as ThemeChoice[]) {
    await chooseByPointer(page, choice);
    const expectedTheme = choice === 'default' ? 'light' : choice;
    await assertThemeEvents(page, choice, expectedTheme);
    await assertSelected(page, choice, expectedTheme);
    current = choice;
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('archimate-js.ui-theme')), 'high-contrast-dark');
  await page.reload({ waitUntil: 'networkidle' });
  await installThemeEventProbe(page);
  await assertSelected(page, 'high-contrast-dark', 'high-contrast-dark');
  await page.locator('.djs-element[data-element-id="view-customer"]').waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.__testViewer)), true);
  await page.evaluate(async (viewId) => {
    const viewer = window.__testViewer;
    if (!viewer) throw new Error('Real mounted viewer was not captured');
    await viewer.openView(viewId);
  }, secondaryViewId);
  await page.locator('.djs-element[data-element-id="theme-secondary-node"]').waitFor();
  assert.equal(await page.locator('.djs-element[data-element-id="view-customer"]').count(), 0);
  await assertSelected(page, 'high-contrast-dark', 'high-contrast-dark');
  current = 'high-contrast-dark';
  for (const choice of choices) {
    await chooseByPointer(page, choice);
    const expectedTheme = choice === 'default' ? 'light' : choice;
    await assertThemeEvents(page, choice, expectedTheme);
    await assertSelected(page, choice, choice === 'default' ? 'light' : choice);
    current = choice;
  }
  await chooseByPointer(page, 'default');
  await assertThemeEvents(page, 'default', 'light');
  current = 'default';
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('.am-app[data-theme="dark"]').waitFor();
  await assertSelected(page, 'default', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('.am-app[data-theme="light"]').waitFor();
  await assertSelected(page, 'default', 'light');
  await chooseByPointer(page, 'dark');
  await assertThemeEvents(page, 'dark', 'dark');
  current = 'dark';
  await page.emulateMedia({ colorScheme: 'light' });
  await assertSelected(page, 'dark', 'dark');
  await assertStatusNotColorOnly(page);
  await context.close();

  const blocked = await browser.newContext({ colorScheme: 'light' });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  await blocked.addInitScript(() => {
    const blockedStorage = {
      getItem() { throw new DOMException('Synthetic blocked storage', 'SecurityError'); },
      setItem() { throw new DOMException('Synthetic blocked storage', 'SecurityError'); }
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => blockedStorage });
  });
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', (error) => pageErrors.push(error.message));
  blockedPage.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await blockedPage.goto(`${origin}/examples/read-only/`, { waitUntil: 'networkidle' });
  await blockedPage.locator('#status[data-state="success"]').waitFor();
  await installThemeEventProbe(blockedPage);
  await chooseByPointer(blockedPage, 'high-contrast-light');
  await assertThemeEvents(blockedPage, 'high-contrast-light', 'high-contrast-light');
  await assertSelected(blockedPage, 'high-contrast-light', 'high-contrast-light');
  await blockedPage.reload({ waitUntil: 'networkidle' });
  await installThemeEventProbe(blockedPage);
  await chooseByPointer(blockedPage, 'high-contrast-light');
  await assertThemeEvents(blockedPage, 'high-contrast-light', 'high-contrast-light');
  await assertSelected(blockedPage, 'high-contrast-light', 'high-contrast-light');
  await blockedPage.reload({ waitUntil: 'networkidle' });
  await assertSelected(blockedPage, 'default', 'light');
  assert.deepEqual({ pageErrors, consoleErrors }, { pageErrors: [], consoleErrors: [] });
  await blocked.close();

  const reduced = await browser.newContext({ colorScheme: 'light', reducedMotion: 'reduce' });
  const reducedPage = await openExample(reduced, origin);
  await assertReducedMotion(reducedPage);
  await reduced.close();
  console.log('theme chooser browser test passed for keyboard, pointer, persistence, OS, storage, and motion');
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
