// SYNTHETIC: Browser assertions use the checked-in synthetic DTO MEFF fixture only.
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { createReadStream, existsSync } from 'node:fs';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { unlink, writeFile } from 'node:fs/promises';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { createServer } from 'node:http';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import path from 'node:path';
// @ts-expect-error Node types are intentionally excluded from browser-facing source.
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import webpack from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPath = path.join(root, 'test/browser/modeler-theme-contrast.generated.js');
const choices = [
  { key: 'default/light-preference', choice: 'default', theme: 'light', preference: 'light' },
  { key: 'default/dark-preference', choice: 'default', theme: 'dark', preference: 'dark' },
  { key: 'light', choice: 'light', theme: 'light', preference: 'light' },
  { key: 'dark', choice: 'dark', theme: 'dark', preference: 'dark' },
  { key: 'high-contrast-light', choice: 'high-contrast-light',
    theme: 'high-contrast-light', preference: 'light' },
  { key: 'high-contrast-dark', choice: 'high-contrast-dark',
    theme: 'high-contrast-dark', preference: 'dark' }
] as const;

interface Swatch { color: string; background: string; effectiveBackground: string; border: string;
  outline: string; outlineWidth: number; outlineOffset: number;
  rect: { width: number; height: number; left: number; top: number; right: number;
    bottom: number }; focusVisible: boolean }
interface SvgSwatch { stroke: string; fill: string; strokeWidth: number; rect: { width: number; height: number } }

await writeFile(entryPath, `
  import Modeler from '../../dist/modeler/index.js';
  Object.assign(window, { ModelerThemeContrastTest: { Modeler } });
`);

try {
  const compiler = webpack({ mode: 'development', target: 'web', entry: entryPath,
    output: { path: path.join(root, '.ci-build'), filename: 'modeler-theme-contrast-test.js' },
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

function contentType(file: string): string {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.ttf')) return 'font/ttf';
  if (file.endsWith('.woff2')) return 'font/woff2';
  if (file.endsWith('.woff')) return 'font/woff';
  return 'text/javascript; charset=utf-8';
}

async function safeFile(route: string): Promise<string | undefined> {
  const relative = route.replace(/^\/+/, '');
  if (relative.includes('..')) return undefined;
  if (!relative.startsWith('assets/') && !relative.startsWith('archimate-font/') &&
      !relative.startsWith('node_modules/diagram-js/assets/')) return undefined;
  const file = path.join(root, relative);
  if (!existsSync(file)) return undefined;
  return file;
}

const server = createServer(async (request: { url?: string }, response: {
  setHeader(name: string, value: string): void;
  writeHead(status: number): { end(): void };
  end(body?: string): void;
}) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><head>
      <link rel="stylesheet" href="/node_modules/diagram-js/assets/diagram-js.css">
      <link rel="stylesheet" href="/assets/archimate-js.css">
      </head><body><main class="am-app" data-theme="light">
      <div class="am-ui-toolbar" aria-label="Synthetic modeler toolbar">
        <button id="toolbar-default" class="am-ui-button">Save</button>
        <button id="toolbar-selected" class="am-ui-button" aria-pressed="true">Select</button>
        <button id="toolbar-disabled" class="am-ui-button" disabled>Disabled</button>
      </div>
      <p id="status" class="am-ui-status" data-state="error">Synthetic error status</p>
      <div id="overlay" class="am-ui-overlay" role="alert">
        <strong id="overlay-large" style="font-size:24px">Synthetic overlay</strong>
      </div>
      <div id="canvas" style="width:800px;height:500px"></div></main></body></html>`);
    return;
  }
  if (pathname === '/.ci-build/modeler-theme-contrast-test.js') {
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    createReadStream(path.join(root, '.ci-build/modeler-theme-contrast-test.js')).pipe(response);
    return;
  }
  if (pathname === '/synthetic.xml') {
    response.setHeader('content-type', 'application/xml; charset=utf-8');
    createReadStream(path.join(root, 'test/fixtures/synthetic/dto-export-view.xml')).pipe(response);
    return;
  }
  try {
    const file = await safeFile(pathname);
    if (!file) throw new Error('not found');
    response.setHeader('content-type', contentType(file));
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

function rgba(css: string): [number, number, number, number] {
  const match = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(css);
  if (!match) throw new Error(`Expected computed RGB(A), got ${css}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
}

function opaque(css: string, background = 'rgb(255, 255, 255)'): string {
  const [red, green, blue, alpha] = rgba(css);
  if (alpha === 1) return css;
  const [br, bg, bb] = rgba(background);
  const channel = (front: number, back: number) => Math.round(front * alpha + back * (1 - alpha));
  return `rgb(${channel(red, br)}, ${channel(green, bg)}, ${channel(blue, bb)})`;
}

function luminance(css: string): number {
  const linear = rgba(css).slice(0, 3).map((value) => {
    const fraction = value / 255;
    return fraction <= 0.04045 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first: string, second: string): number {
  const [dark, light] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
}

function minimum(mode: string, kind: 'text' | 'large' | 'nonText'): number {
  if (kind === 'nonText') return 3;
  if (mode.startsWith('high-contrast')) return kind === 'large' ? 4.5 : 7;
  return kind === 'large' ? 3 : 4.5;
}

function requireRatio(mode: string, label: string, first: string, second: string, min: number): number {
  const ratio = contrast(opaque(first, second), second);
  assert.ok(ratio >= min, `${mode} ${label}: ${ratio.toFixed(2)}:1 is below ${min}:1`);
  return ratio;
}

async function swatch(page: Page, selector: string): Promise<Swatch> {
  return page.locator(selector).first().evaluate((element) => {
    const opaqueBackground = (start: Element): string => {
      for (let current: Element | null = start; current; current = current.parentElement) {
        const background = getComputedStyle(current).backgroundColor;
        const match = /^rgba?\(\s*\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?\s*\)$/.exec(background);
        if (match && (match[1] === undefined || Number(match[1]) === 1)) return background;
      }
      return 'rgb(255, 255, 255)';
    };
    const css = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { color: css.color, background: css.backgroundColor, effectiveBackground: opaqueBackground(element),
      border: css.borderTopColor, outline: css.outlineColor, outlineWidth: parseFloat(css.outlineWidth),
      outlineOffset: parseFloat(css.outlineOffset),
      rect: { width: rect.width, height: rect.height, left: rect.left, top: rect.top,
        right: rect.right, bottom: rect.bottom },
      focusVisible: element.matches(':focus-visible') };
  });
}

async function svgSwatches(page: Page, selector: string): Promise<SvgSwatch[]> {
  return page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const css = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { stroke: css.stroke, fill: css.fill, strokeWidth: parseFloat(css.strokeWidth),
      rect: { width: rect.width, height: rect.height } };
  }));
}

async function setupModeler(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ url: '/.ci-build/modeler-theme-contrast-test.js' });
  await page.evaluate(async () => {
    const api = (window as unknown as { ModelerThemeContrastTest: { Modeler: new(options: {
      container: Element | null; width: number; height: number }) => {
      open(xml: string, options: { viewId: string }): Promise<unknown>;
      getEngineCapabilities(name: 'diagram-js'): { get(name: string): unknown };
    } } }).ModelerThemeContrastTest;
    const xml = await (await fetch('/synthetic.xml')).text();
    const modeler = new api.Modeler({ container: document.querySelector('#canvas'), width: 800, height: 500 });
    await modeler.open(xml, { viewId: 'view-dto-export' });
    const engine = modeler.getEngineCapabilities('diagram-js');
    Object.assign(window, { modelerThemeContrast: { modeler, engine } });
  });
}

async function applyTheme(page: Page, choice: typeof choices[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: choice.preference });
  await page.locator('.am-app').evaluate((app, theme) => app.setAttribute('data-theme', theme), choice.theme);
  await page.locator('.am-app').evaluate((app, selected) => app.setAttribute('data-choice', selected), choice.choice);
}

async function preparePaletteStates(page: Page): Promise<void> {
  await page.locator('.djs-palette .entry').first().waitFor();
  await page.locator('.djs-palette .entry').evaluateAll((entries) => {
    entries.slice(0, 4).forEach((entry, index) => {
      entry.setAttribute('tabindex', index === 0 ? '0' : '-1');
      entry.setAttribute('aria-label', `Synthetic palette entry ${index + 1}`);
    });
    entries[1]?.setAttribute('aria-pressed', 'true');
    entries[2]?.setAttribute('aria-disabled', 'true');
  });
}

async function prepareCanvasStates(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = (window as unknown as { modelerThemeContrast: { engine: { get(name: string): any } } })
      .modelerThemeContrast;
    const canvas = state.engine.get('canvas');
    const registry = state.engine.get('elementRegistry');
    const selection = state.engine.get('selection');
    canvas.viewbox({ x: 0, y: 0, width: 800, height: 500 });
    selection.select([registry.get('node-component'), registry.get('serving-connection')]);
    canvas.addMarker(registry.get('node-service'), 'hover');
    const svg = document.querySelector('#canvas svg');
    if (!svg) throw new Error('Missing synthetic modeler SVG');
    const rect = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true,
      shiftKey: true, button: 0, buttons: 1, clientX: rect.left + 10, clientY: rect.top + 10 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true,
      shiftKey: true, buttons: 1, clientX: rect.left + 180, clientY: rect.top + 160 }));
  });
  await page.locator('.djs-lasso-overlay').waitFor();
}

async function releaseLasso(page: Page): Promise<void> {
  await page.evaluate(() => {
    const svg = document.querySelector('#canvas svg');
    const rect = svg?.getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true,
      shiftKey: true, button: 0, buttons: 0, clientX: (rect?.left ?? 0) + 180, clientY: (rect?.top ?? 0) + 160 }));
  });
}

function requireFocus(mode: string, label: string, sample: Swatch, background: string): number {
  assert.equal(sample.focusVisible, true, `${mode} ${label}: focus is not :focus-visible`);
  assert.ok(sample.outlineWidth >= 2, `${mode} ${label}: focus outline is thinner than 2px`);
  const offset = Math.max(sample.outlineOffset, 0);
  const area = (sample.rect.width + 2 * (offset + sample.outlineWidth)) *
    (sample.rect.height + 2 * (offset + sample.outlineWidth)) -
    (sample.rect.width + 2 * offset) * (sample.rect.height + 2 * offset);
  assert.ok(area >= 4 * (sample.rect.width + sample.rect.height),
    `${mode} ${label}: focus area is below the WCAG 2.4.13 two-pixel perimeter benchmark`);
  return requireRatio(mode, `${label} focus`, sample.outline, background, 3);
}

function requireUnclipped(mode: string, label: string, sample: Swatch): void {
  const margin = sample.outlineWidth + Math.max(sample.outlineOffset, 0);
  assert.ok(sample.rect.left - margin >= -1 && sample.rect.top - margin >= -1,
    `${mode} ${label}: focus indicator is clipped at the viewport start`);
  assert.ok(sample.rect.right + margin <= 1280 + 1 && sample.rect.bottom + margin <= 720 + 1,
    `${mode} ${label}: focus indicator is clipped at the viewport end`);
}

function requireSvgSurfaces(mode: string, label: string, surfaces: SvgSwatch[]): void {
  assert.ok(surfaces.length > 0, `${mode} ${label}: no rendered outline or boundary was found`);
  for (const [index, surface] of surfaces.entries()) {
    assert.ok(surface.rect.width > 0 && surface.rect.height > 0,
      `${mode} ${label} ${index + 1}: rendered box is empty`);
    assert.ok(surface.stroke !== 'none' && surface.strokeWidth > 0,
      `${mode} ${label} ${index + 1}: visible stroke is missing`);
  }
}

function interactionColor(surface: SvgSwatch): string {
  return surface.fill !== 'none' ? surface.fill : surface.stroke;
}

async function measureButtons(page: Page, mode: string, appBackground: string): Promise<Record<string, number>> {
  const ratios: Record<string, number> = {};
  const normal = minimum(mode, 'text');
  const defaults = await swatch(page, '#toolbar-default');
  ratios.toolbarDefaultText = requireRatio(mode, 'toolbar default text',
    defaults.color, defaults.background, normal);
  ratios.toolbarDefaultBoundary = requireRatio(mode, 'toolbar default boundary',
    defaults.border, appBackground, 3);
  await page.locator('#toolbar-default').hover();
  const hover = await swatch(page, '#toolbar-default');
  ratios.toolbarHoverText = requireRatio(mode, 'toolbar hover text', hover.color, hover.background, normal);
  await page.locator('#toolbar-selected').hover();
  const selected = await swatch(page, '#toolbar-selected');
  ratios.toolbarSelectedText = requireRatio(mode, 'toolbar selected text',
    selected.color, selected.background, normal);
  const disabled = await swatch(page, '#toolbar-disabled');
  ratios.toolbarDisabledText = requireRatio(mode, 'toolbar disabled text',
    disabled.color, disabled.background, normal);
  await page.locator('body').evaluate((body) => {
    body.setAttribute('tabindex', '-1');
    (body as HTMLElement).focus();
  });
  await page.keyboard.press('Tab');
  const focused = await swatch(page, '#toolbar-default');
  ratios.toolbarFocus = requireFocus(mode, 'toolbar button', focused, appBackground);
  requireUnclipped(mode, 'toolbar button', focused);
  return ratios;
}

async function measurePalette(page: Page, mode: string): Promise<Record<string, number>> {
  const ratios: Record<string, number> = {};
  const palette = await swatch(page, '.djs-palette');
  const normal = minimum(mode, 'text');
  const entry = await swatch(page, '.djs-palette .entry');
  ratios.paletteDefaultIcon = requireRatio(mode, 'palette default icon',
    entry.color, palette.background, normal);
  await page.locator('.djs-palette .entry').nth(3).hover();
  const hover = await swatch(page, '.djs-palette .entry:hover');
  ratios.paletteHoverIcon = requireRatio(mode, 'palette hover icon',
    hover.color, hover.effectiveBackground, normal);
  const selected = await swatch(page, '.djs-palette .entry[aria-pressed="true"]');
  ratios.paletteSelectedIcon = requireRatio(mode, 'palette selected icon',
    selected.color, selected.background, normal);
  const disabled = await swatch(page, '.djs-palette .entry[aria-disabled="true"]');
  ratios.paletteDisabledIcon = requireRatio(mode, 'palette disabled icon',
    disabled.color, disabled.background, normal);
  ratios.paletteBoundary = requireRatio(mode, 'palette boundary', palette.border, palette.background, 3);
  await page.keyboard.press('Tab');
  await page.locator('.djs-palette .entry').first().evaluate((entry) => (entry as HTMLElement).focus());
  const focused = await swatch(page, '.djs-palette .entry:focus-visible');
  ratios.paletteFocus = requireFocus(mode, 'palette entry', focused, palette.background);
  requireUnclipped(mode, 'palette entry', focused);
  return ratios;
}

async function measureCanvas(page: Page, mode: string): Promise<Record<string, number>> {
  await prepareCanvasStates(page);
  const ratios: Record<string, number> = {};
  const canvas = await swatch(page, '.djs-container');
  const nodeOutlines = await svgSwatches(page, '[data-element-id="node-component"].selected .djs-outline');
  const multiSelectionBoxes = await svgSwatches(page, '.djs-selection-outline');
  requireSvgSurfaces(mode, 'selected node outline', nodeOutlines);
  requireSvgSurfaces(mode, 'multi-selection bounding box', multiSelectionBoxes);
  for (const [index, outline] of [...nodeOutlines, ...multiSelectionBoxes].entries()) {
    ratios[`selectionOutline${index + 1}`] = requireRatio(mode, `selection or multi-selection outline ${index + 1}`,
      outline.stroke, canvas.background, minimum(mode, 'nonText'));
  }
  const hover = (await svgSwatches(page, '.djs-element.hover > .djs-hit-all, ' +
    '.djs-element.hover > .djs-hit-stroke, .djs-element.hover > .djs-hit-click-stroke'))
    .find((item) => item.stroke !== 'none');
  if (!hover) throw new Error(`${mode}: canvas hover affordance is missing`);
  ratios.canvasHover = requireRatio(mode, 'canvas hover affordance',
    hover.stroke, canvas.background, minimum(mode, 'nonText'));
  const lasso = (await svgSwatches(page, '.djs-lasso-overlay'))[0];
  requireSvgSurfaces(mode, 'lasso rectangle', [lasso]);
  ratios.lassoStroke = requireRatio(mode, 'lasso rectangle stroke',
    lasso.stroke, canvas.background, minimum(mode, 'nonText'));
  await releaseLasso(page);
  return { ...ratios, ...(await measureSelectedConnection(page, mode, canvas.background)) };
}

async function selectConnectionOnly(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = (window as unknown as { modelerThemeContrast: { engine: { get(name: string): any } } })
      .modelerThemeContrast;
    const registry = state.engine.get('elementRegistry');
    state.engine.get('selection').select(registry.get('serving-connection'));
  });
  await page.waitForTimeout(20);
}

async function selectedConnectionVisuals(page: Page): Promise<SvgSwatch[]> {
  const visuals = await svgSwatches(page, '.djs-bendpoints.selected .djs-bendpoint .djs-visual, ' +
    '.djs-bendpoints.selected .djs-segment-dragger .djs-visual');
  return visuals.filter((surface) => surface.rect.width > 0 && surface.rect.height > 0);
}

async function measureSelectedConnection(page: Page, mode: string, canvasBackground: string):
Promise<Record<string, number>> {
  await selectConnectionOnly(page);
  const ratios: Record<string, number> = {};
  const visuals = await selectedConnectionVisuals(page);
  requireSvgSurfaces(mode, 'selected connection handles', visuals);
  for (const [index, visual] of visuals.entries()) {
    ratios[`selectedConnectionHandle${index + 1}`] = requireRatio(mode,
      `selected connection handle ${index + 1}`, interactionColor(visual), canvasBackground,
      minimum(mode, 'nonText'));
  }
  const connection = await svgSwatches(page, '[data-element-id="serving-connection"] .djs-visual > *');
  requireSvgSurfaces(mode, 'selected connection stroke', connection);
  return ratios;
}

async function measureStatusAndOverlay(page: Page, mode: string, appBackground: string): Promise<Record<string, number>> {
  const ratios: Record<string, number> = {};
  const status = await swatch(page, '#status');
  const overlay = await swatch(page, '#overlay');
  const large = await swatch(page, '#overlay-large');
  ratios.statusText = requireRatio(mode, 'status text', status.color, status.background, minimum(mode, 'text'));
  ratios.statusErrorBoundary = requireRatio(mode, 'status error boundary', status.border, appBackground, 3);
  ratios.overlayText = requireRatio(mode, 'overlay text', overlay.color, overlay.background, minimum(mode, 'text'));
  ratios.overlayLargeText = requireRatio(mode, 'overlay large text',
    large.color, overlay.background, minimum(mode, 'large'));
  ratios.overlayBoundary = requireRatio(mode, 'overlay boundary', overlay.border, appBackground, 3);
  return ratios;
}

async function measureMode(page: Page, choice: typeof choices[number]): Promise<Record<string, number>> {
  await applyTheme(page, choice);
  await page.mouse.move(0, 0);
  await preparePaletteStates(page);
  const app = await swatch(page, '.am-app');
  return { ...(await measureButtons(page, choice.theme, app.background)),
    ...(await measurePalette(page, choice.theme)),
    ...(await measureCanvas(page, choice.theme)),
    ...(await measureStatusAndOverlay(page, choice.theme, app.background)) };
}

async function checkForcedColorAdjustments(page: Page): Promise<void> {
  const selectors = ['.am-app', '.am-ui-button', '.djs-palette', '.djs-palette .entry:focus-visible',
    '.am-ui-status', '.am-ui-overlay', '.djs-container', '.djs-element.selected .djs-outline',
    '.djs-selection-outline', '.djs-element.hover > .djs-hit-all', '.djs-lasso-overlay'];
  const adjustments = await page.evaluate((items) => items.map((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return [selector, getComputedStyle(element).forcedColorAdjust];
  }), selectors);
  assert.ok(adjustments.every(([, value]) => value !== 'none'),
    `app chrome suppresses forced-color adjustment: ${JSON.stringify(adjustments)}`);
}

async function checkForcedColorConnectionAdjustments(page: Page): Promise<void> {
  const selectors = ['.djs-bendpoints.selected .djs-bendpoint .djs-visual',
    '[data-element-id="serving-connection"] .djs-visual > *'];
  const adjustments = await page.evaluate((items) => items.map((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return [selector, getComputedStyle(element).forcedColorAdjust];
  }), selectors);
  assert.ok(adjustments.every(([, value]) => value !== 'none'),
    `selected connection suppresses forced-color adjustment: ${JSON.stringify(adjustments)}`);
}

async function checkForcedColorConnection(page: Page, canvasBackground: string): Promise<void> {
  await selectConnectionOnly(page);
  await checkForcedColorConnectionAdjustments(page);
  const connectionHandles = await selectedConnectionVisuals(page);
  requireSvgSurfaces('forced-colors', 'selected connection handles', connectionHandles);
  for (const [index, visual] of connectionHandles.entries()) {
    requireRatio('forced-colors', `selected connection handle ${index + 1}`,
      interactionColor(visual), canvasBackground, 3);
  }
  const connectionStroke = await svgSwatches(page, '[data-element-id="serving-connection"] .djs-visual > *');
  requireSvgSurfaces('forced-colors', 'selected connection stroke', connectionStroke);
}

async function checkForcedColors(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active' });
  await page.locator('.am-app').evaluate((app) => app.setAttribute('data-theme', 'light'));
  await preparePaletteStates(page);
  await prepareCanvasStates(page);
  await page.locator('.djs-palette .entry').first().evaluate((entry) => (entry as HTMLElement).focus());
  assert.equal(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), true);
  await checkForcedColorAdjustments(page);
  const app = await swatch(page, '.am-app');
  const button = await swatch(page, '#toolbar-default');
  const palette = await swatch(page, '.djs-palette');
  const paletteFocus = await swatch(page, '.djs-palette .entry:focus-visible');
  requireFocus('forced-colors', 'palette entry', paletteFocus, palette.background);
  requireRatio('forced-colors', 'palette boundary', palette.border, palette.background, 3);
  const status = await swatch(page, '#status');
  const overlay = await swatch(page, '#overlay');
  requireRatio('forced-colors', 'status error boundary', status.border, app.background, 3);
  requireRatio('forced-colors', 'overlay boundary', overlay.border, app.background, 3);
  await page.locator('body').evaluate((body) => {
    body.setAttribute('tabindex', '-1');
    (body as HTMLElement).focus();
  });
  await page.keyboard.press('Tab');
  const focused = await swatch(page, '#toolbar-default');
  requireRatio('forced-colors', 'toolbar boundary', button.border, app.background, 3);
  requireFocus('forced-colors', 'toolbar button', focused, app.background);
  const canvas = await swatch(page, '.djs-container');
  const nodeOutlines = await svgSwatches(page, '[data-element-id="node-component"].selected .djs-outline');
  const multiSelectionBoxes = await svgSwatches(page, '.djs-selection-outline');
  const hover = await svgSwatches(page, '.djs-element.hover > .djs-hit-all, ' +
    '.djs-element.hover > .djs-hit-stroke, .djs-element.hover > .djs-hit-click-stroke');
  requireSvgSurfaces('forced-colors', 'selected node outline', nodeOutlines);
  requireSvgSurfaces('forced-colors', 'multi-selection bounding box', multiSelectionBoxes);
  requireSvgSurfaces('forced-colors', 'canvas hover outline', hover);
  for (const [index, outline] of [...nodeOutlines, ...multiSelectionBoxes, ...hover].entries()) {
    requireRatio('forced-colors', `interaction outline ${index + 1}`, outline.stroke, canvas.background, 3);
  }
  const lasso = (await svgSwatches(page, '.djs-lasso-overlay'))[0];
  requireSvgSurfaces('forced-colors', 'lasso rectangle', [lasso]);
  requireRatio('forced-colors', 'lasso stroke', lasso.stroke, canvas.background, 3);
  await releaseLasso(page);
  await checkForcedColorConnection(page, canvas.background);
}

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
  headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, baseURL:
    `http://127.0.0.1:${address.port}` });
  await setupModeler(page);
  const matrix: Record<string, Record<string, number>> = {};
  for (const choice of choices) matrix[choice.key] = await measureMode(page, choice);
  await checkForcedColors(page);
  console.log(JSON.stringify({ browser: 'Chromium', platform: process.platform, matrix }));
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error: unknown) => error ? reject(error) : resolve()));
}
