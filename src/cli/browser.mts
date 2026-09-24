import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

import { findChrome } from './io.mjs';
import { applyLayout, validateLayout } from './layout.mjs';
import type { ExportArtifacts, ExportOptions, RenderOptions } from './types.mjs';

const RENDER_CODES = new Set([
  'INVALID_OPTIONS', 'MODEL_TOO_LARGE', 'MODEL_IMPORT_FAILED', 'VIEW_NOT_FOUND',
  'VIEW_NAME_AMBIGUOUS', 'VIEW_RENDER_FAILED', 'VIEW_SELECTION_FAILED', 'VIEWER_FAILURE',
  'EXPORT_AREA_EXCEEDED', 'EXPORT_DIMENSIONS_EXCEEDED', 'EXPORT_DIMENSIONS_INVALID', 'FONT_READY_FAILED'
]);

export async function blockNetwork(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => route.abort());
}

function withBackground(svg: string, background: string): string {
  if (background === 'transparent') return svg;
  return svg.replace(/^(<svg\b[^>]*>)/, `$1<rect width="100%" height="100%" fill="${background}"/>`);
}

async function renderSvg(page: Page, xml: string, options: RenderOptions | ExportOptions): Promise<string> {
  const result = await page.evaluate(async ({ model, viewId, viewName }) => {
    try {
      const svg = await window.ArchimateJS.renderViewToSvg({
        xml: model, viewId, viewName, width: 1024, height: 768
      });
      return { ok: true as const, svg };
    } catch (error) {
      return { ok: false as const, code: error instanceof Error && 'code' in error ? String(error.code) : '' };
    }
  }, { model: xml, viewId: options.viewId, viewName: options.viewName });
  if (!result.ok) throw new Error(RENDER_CODES.has(result.code) ? result.code : 'VIEW_RENDER_FAILED');
  return result.svg;
}

async function installSvg(page: Page, svg: string, background: string): Promise<void> {
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  await page.evaluate(({ markup, color }) => {
    document.documentElement.style.background = color;
    document.body.style.cssText = 'margin:0;display:inline-block;background:inherit';
    document.body.innerHTML = markup;
  }, { markup: svg, color: background === 'transparent' ? 'transparent' : background });
}

async function pngArtifact(page: Page, transparent: boolean): Promise<Uint8Array> {
  const svg = page.locator('svg.am-diagram');
  await svg.waitFor({ state: 'visible' });
  return svg.screenshot({ type: 'png', omitBackground: transparent });
}

async function pdfArtifact(page: Page, options: ExportOptions): Promise<Uint8Array> {
  await page.evaluate(({ fit }) => {
    document.documentElement.style.width = '100%';
    document.documentElement.style.height = '100%';
    document.body.style.cssText =
      'margin:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:inherit';
    const svg = document.querySelector('svg');
    if (svg) {
      svg.setAttribute('style', 'max-width:100%;max-height:100%;width:100%;height:100%');
      svg.setAttribute('preserveAspectRatio',
        `xMidYMid ${fit === 'cover' ? 'slice' : 'meet'}`);
    }
  }, { fit: options.fit });
  const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]!));
  const withText = (value: string | undefined): string =>
    value ? `<div style="font:10px sans-serif;width:100%;text-align:center">${escapeHtml(value)}</div>` : '';
  return page.pdf({
    format: options.pdfPageSize,
    landscape: options.pdfOrientation === 'landscape',
    margin: { top: options.pdfTitle ? '24px' : '0', right: '0',
      bottom: options.pdfFooter ? '24px' : '0', left: '0' },
    displayHeaderFooter: Boolean(options.pdfTitle || options.pdfFooter),
    headerTemplate: withText(options.pdfTitle),
    footerTemplate: withText(options.pdfFooter),
    printBackground: true
  });
}

async function ensureRenderer(bundlePath: string): Promise<void> {
  try {
    await access(bundlePath, constants.R_OK);
  } catch {
    throw new Error('RENDER_BUILD_MISSING');
  }
}

async function waitForFonts(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      await Promise.race([
        document.fonts.ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error()), 5000))
      ]);
      if (document.fonts.status !== 'loaded') throw new Error();
    });
  } catch {
    throw new Error('FONT_READY_FAILED');
  }
}

async function captureExport(
  renderer: Page,
  capture: Page,
  xml: string,
  options: ExportOptions
): Promise<ExportArtifacts> {
  const svg = await renderSvg(renderer, xml, options);
  validateLayout(svg, options);
  const decorated = withBackground(applyLayout(svg, options.padding, options.fit), options.background);
  const artifacts: ExportArtifacts = {};
  if (options.formats.includes('svg') || options.allViews) artifacts.svg = decorated;
  if (options.formats.some((format) => format !== 'svg')) {
    await installSvg(capture, decorated, options.background);
    await waitForFonts(capture);
  }
  if (options.formats.includes('png')) {
    artifacts.png = await pngArtifact(capture, options.background === 'transparent');
  }
  if (options.formats.includes('pdf')) artifacts.pdf = await pdfArtifact(capture, options);
  return artifacts;
}
export async function renderArtifacts(
  packageRoot: string,
  xml: string,
  options: RenderOptions | ExportOptions
): Promise<ExportArtifacts> {
  const values = await renderBatchArtifacts(packageRoot, xml, [options]);
  return values[0];
}

export async function renderBatchArtifacts(
  packageRoot: string,
  xml: string,
  requests: Array<RenderOptions | ExportOptions>
): Promise<ExportArtifacts[]> {
  const bundlePath = path.join(packageRoot, 'dist/browser/archimate-js.js');
  await ensureRenderer(bundlePath);
  const executablePath = await findChrome(requests[0].chrome);
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true });
  } catch {
    throw new Error('BROWSER_LAUNCH_FAILED');
  }
  try {
    const scale = requests[0].command === 'export' ? requests[0].scale : 1;
    const context = await browser.newContext({
      locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1024, height: 768 },
      deviceScaleFactor: scale
    });
    await blockNetwork(context);
    const renderer = await context.newPage();
    await renderer.addScriptTag({ path: bundlePath });
    const capture = await context.newPage();
    const results: ExportArtifacts[] = [];
    for (const options of requests) {
      if (options.command === 'render') {
        results.push({ svg: await renderSvg(renderer, xml, options) });
      } else {
        results.push(await captureExport(renderer, capture, xml, options));
      }
    }
    return results;
  } catch (error) {
    const code = error instanceof Error && RENDER_CODES.has(error.message)
      ? error.message : 'VIEW_RENDER_FAILED';
    throw new Error(code);
  } finally {
    await browser.close().catch(() => {});
  }
}

declare global {
  interface Window {
    ArchimateJS: {
      renderViewToSvg(options: {
        xml: string;
        viewId?: string;
        viewName?: string;
        width: number;
        height: number;
      }): Promise<string>;
    };
  }
}
