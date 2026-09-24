import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

import type {
  ExportArtifact, ExportBackground, ExportDiagnostic, ExportFileRequest, ExportFileResult,
  ExportFormat, ExportOutcome, ExportRequest, ExportResult, ExportServiceConfig
} from './types.mjs';

const MAX_XML_BYTES = 1_048_576;
const MAX_DIMENSION = 32_768;
const MAX_PIXELS = 64_000_000;
const FORMATS = new Set<ExportFormat>(['svg', 'png', 'pdf']);
const CANONICAL_FORMATS: readonly ExportFormat[] = ['svg', 'png', 'pdf'];
const CODES = new Set([
  'INVALID_OPTIONS', 'INPUT_SIZE_LIMIT', 'MODEL_TOO_LARGE', 'MODEL_IMPORT_FAILED', 'VIEW_NOT_FOUND',
  'VIEW_NAME_AMBIGUOUS', 'VIEW_SELECTION_FAILED', 'VIEWER_FAILURE', 'VIEW_RENDER_FAILED',
  'RENDER_BUILD_MISSING', 'BROWSER_NOT_FOUND',
  'BROWSER_LAUNCH_FAILED', 'FONT_READY_FAILED', 'EXPORT_DIMENSIONS_INVALID',
  'EXPORT_DIMENSIONS_EXCEEDED', 'EXPORT_AREA_EXCEEDED', 'EXPORT_ABORTED', 'OUTPUT_WRITE_FAILED'
]);
const MESSAGES: Record<string, string> = {
  INVALID_OPTIONS: 'Export options are invalid.',
  INPUT_SIZE_LIMIT: 'The ArchiMate model exceeds the supported size limit.',
  MODEL_IMPORT_FAILED: 'Unable to load the ArchiMate model.',
  MODEL_TOO_LARGE: 'The ArchiMate model exceeds the supported size limit.',
  VIEW_NOT_FOUND: 'The requested ArchiMate view was not found.',
  VIEW_NAME_AMBIGUOUS: 'The requested ArchiMate view name is ambiguous.',
  VIEW_SELECTION_FAILED: 'Unable to open the requested ArchiMate view.',
  VIEWER_FAILURE: 'Unable to render the ArchiMate view.',
  VIEW_RENDER_FAILED: 'Unable to render the requested ArchiMate view.',
  RENDER_BUILD_MISSING: 'The browser renderer build is unavailable.',
  BROWSER_NOT_FOUND: 'Chrome or Chromium was not found.',
  BROWSER_LAUNCH_FAILED: 'Unable to start Chrome or Chromium.',
  FONT_READY_FAILED: 'Fonts did not become ready before capture.',
  EXPORT_DIMENSIONS_INVALID: 'The rendered view has invalid dimensions.',
  EXPORT_DIMENSIONS_EXCEEDED: 'The requested export exceeds supported dimensions.',
  EXPORT_AREA_EXCEEDED: 'The requested export exceeds the supported pixel budget.',
  EXPORT_ABORTED: 'The export was cancelled.',
  OUTPUT_WRITE_FAILED: 'Unable to write export files.'
};

type Bounds = { x: number; y: number; width: number; height: number };
type NormalizedRequest = Required<Pick<ExportRequest, 'formats' | 'scale' | 'background' |
  'fit' | 'padding' | 'pdfPageSize' | 'pdfOrientation'>> & ExportRequest;

class ExportError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(CODES.has(code) ? code : 'VIEW_RENDER_FAILED');
    this.code = CODES.has(code) ? code : 'VIEW_RENDER_FAILED';
    Object.defineProperty(this, 'publicMessage', { value: MESSAGES[this.code], enumerable: true });
  }
}

function error(code: string): ExportError {
  return new ExportError(code);
}

function normalizeError(value: unknown, fallback = 'VIEW_RENDER_FAILED'): ExportError {
  if (value instanceof ExportError) return value;
  const code = value instanceof Error && 'code' in value ? String(value.code) : '';
  return error(CODES.has(code) ? code : fallback);
}

function normalize(request: ExportRequest): NormalizedRequest {
  const bytes = typeof request?.xml === 'string'
    ? new TextEncoder().encode(request.xml).byteLength : 0;
  if (!request || typeof request.xml !== 'string' || !request.xml || bytes > MAX_XML_BYTES ||
      Boolean(request.viewId) === Boolean(request.viewName) ||
      !Array.isArray(request.formats) || !request.formats.length ||
      request.formats.some((format) => !FORMATS.has(format)) ||
      new Set(request.formats).size !== request.formats.length) {
    throw error(bytes > MAX_XML_BYTES ? 'INPUT_SIZE_LIMIT' : 'INVALID_OPTIONS');
  }
  const result = {
    ...request,
    formats: CANONICAL_FORMATS.filter((format) => request.formats.includes(format)),
    scale: request.scale ?? 1, background: request.background ?? 'white',
    fit: request.fit ?? 'none', padding: request.padding ?? 0,
    pdfPageSize: request.pdfPageSize ?? 'A4', pdfOrientation: request.pdfOrientation ?? 'portrait'
  } as NormalizedRequest;
  if (!Number.isInteger(result.scale) || result.scale < 1 || result.scale > 4 ||
      !Number.isFinite(result.padding) || result.padding < 0 || result.padding > 1024 ||
      !/^(?:transparent|white|black|#[0-9a-fA-F]{6})$/.test(result.background) ||
      !['none', 'contain', 'cover'].includes(result.fit) ||
      !['A3', 'A4', 'A5', 'Legal', 'Letter'].includes(result.pdfPageSize) ||
      !['portrait', 'landscape'].includes(result.pdfOrientation) ||
      (result.formats.includes('pdf') && result.background === 'transparent') ||
      (result.pdfTitle && (!result.formats.includes('pdf') || result.pdfTitle.length > 200)) ||
      (result.pdfFooter && (!result.formats.includes('pdf') || result.pdfFooter.length > 200))) {
    throw error('INVALID_OPTIONS');
  }
  return result;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw error('EXPORT_ABORTED');
}

async function abortable<T>(
  operation: Promise<T>, signal: AbortSignal | undefined, onAbort: () => Promise<void>,
  onLateResolve?: (value: T) => Promise<void>
): Promise<T> {
  checkAbort(signal);
  if (!signal) return operation;
  let listener: (() => void) | undefined;
  let cancelled = false;
  void operation.then((value) => {
    if (cancelled) void onLateResolve?.(value).catch(() => {});
  }, () => {});
  const cancellation = new Promise<never>((_, reject) => {
    listener = () => {
      cancelled = true;
      void onAbort().finally(() => reject(error('EXPORT_ABORTED')));
    };
    signal.addEventListener('abort', listener, { once: true });
  });
  try { return await Promise.race([operation, cancellation]); }
  finally { if (listener) signal.removeEventListener('abort', listener); }
}

function svgBounds(svg: string): Bounds {
  const root = svg.match(/^<svg\b([^>]*)>/)?.[1];
  const values = root?.match(/\bviewBox="([^"]+)"/i)?.[1].trim().split(/\s+/).map(Number);
  const result = values?.length === 4
    ? { x: values[0], y: values[1], width: values[2], height: values[3] }
    : { x: 0, y: 0, width: Number(root?.match(/\bwidth="([^"]+)"/i)?.[1]),
      height: Number(root?.match(/\bheight="([^"]+)"/i)?.[1]) };
  if (!result || !Object.values(result).every(Number.isFinite) ||
      result.width <= 0 || result.height <= 0) throw error('EXPORT_DIMENSIONS_INVALID');
  return result;
}

function applyLayout(svg: string, request: NormalizedRequest): string {
  const source = svgBounds(svg);
  const padded = { x: source.x - request.padding, y: source.y - request.padding,
    width: source.width + request.padding * 2, height: source.height + request.padding * 2 };
  if (!request.padding && request.fit === 'none') return svg;
  const root = svg.match(/^<svg\b([^>]*)>/);
  if (!root) throw error('EXPORT_DIMENSIONS_INVALID');
  let attrs = root[1].replace(/\s(?:viewBox|width|height|preserveAspectRatio)="[^"]*"/gi, '');
  attrs += ` viewBox="${padded.x} ${padded.y} ${padded.width} ${padded.height}"`;
  attrs += ` width="${padded.width}" height="${padded.height}"`;
  if (request.fit !== 'none') attrs +=
    ` preserveAspectRatio="xMidYMid ${request.fit === 'cover' ? 'slice' : 'meet'}"`;
  return `<svg${attrs}>${svg.slice(root[0].length)}`;
}

function withBackground(svg: string, color: ExportBackground): string {
  return color === 'transparent' ? svg :
    svg.replace(/^(<svg\b[^>]*>)/, `$1<rect width="100%" height="100%" fill="${color}"/>`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]!));
}

async function findChrome(explicit?: string): Promise<string> {
  const configured = explicit || process.env.CHROME_BIN;
  const candidates = configured ? [configured] : String(process.env.PATH || '').split(path.delimiter)
    .flatMap((directory) => ['google-chrome', 'chromium', 'chromium-browser']
      .map((name) => path.join(directory, name)))
    .concat('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* safe probe */ }
  }
  throw error('BROWSER_NOT_FOUND');
}

export async function blockNetwork(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => route.abort());
}

async function renderSvg(page: Page, request: NormalizedRequest, signal?: AbortSignal): Promise<string> {
  const result = await abortable(page.evaluate(async ({ xml, viewId, viewName }) => {
    try {
      return { ok: true as const, svg: await window.ArchimateJS.renderViewToSvg({
        xml, viewId, viewName, width: 1024, height: 768
      }) };
    } catch (value) {
      return { ok: false as const, code: value instanceof Error && 'code' in value
        ? String(value.code) : '' };
    }
  }, request), signal, async () => { await page.close().catch(() => {}); });
  if (!result.ok) throw error(['INVALID_OPTIONS', 'MODEL_TOO_LARGE', 'MODEL_IMPORT_FAILED',
    'VIEW_NOT_FOUND', 'VIEW_NAME_AMBIGUOUS', 'VIEW_SELECTION_FAILED', 'VIEWER_FAILURE']
    .includes(result.code) ? result.code : 'VIEW_RENDER_FAILED');
  return result.svg;
}

async function capture(page: Page, svg: string, request: NormalizedRequest):
  Promise<{ artifacts: ExportArtifact[]; canonicalSvg: string }> {
  const decorated = withBackground(applyLayout(svg, request), request.background);
  const size = svgBounds(decorated);
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(({ markup, color }) => {
    document.documentElement.style.background = color;
    document.body.style.cssText = 'margin:0;display:inline-block;background:inherit';
    document.body.innerHTML = markup;
  }, { markup: decorated, color: request.background === 'transparent' ? 'transparent' : request.background });
  if (request.formats.some((format) => format !== 'svg')) {
    await page.evaluate(async () => {
      await Promise.race([document.fonts.ready, new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error()), 5000))]);
    }).catch(() => { throw error('FONT_READY_FAILED'); });
  }
  const artifactsByFormat = new Map<ExportFormat, ExportArtifact>();
  for (const format of ['svg', 'png', 'pdf'] as const) {
    if (!request.formats.includes(format)) continue;
    if (format === 'svg') artifactsByFormat.set(format,
      { format, bytes: decorated, dimensions: size });
    if (format === 'png') artifactsByFormat.set(format, { format, bytes: await page.locator('svg.am-diagram').screenshot({
      type: 'png', omitBackground: request.background === 'transparent'
    }), dimensions: size });
    if (format === 'pdf') {
      await page.evaluate(({ fit }) => {
        document.documentElement.style.width = '100%';
        document.documentElement.style.height = '100%';
        document.body.style.cssText =
          'margin:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:inherit';
        const diagram = document.querySelector('svg.am-diagram');
        diagram?.setAttribute('style', 'max-width:100%;max-height:100%;width:100%;height:100%');
        diagram?.setAttribute('preserveAspectRatio', `xMidYMid ${fit === 'cover' ? 'slice' : 'meet'}`);
      }, request);
      const text = (value: string | undefined): string =>
        value ? `<div style="font:10px sans-serif;width:100%;text-align:center">${escapeHtml(value)}</div>` : '';
      artifactsByFormat.set(format, { format, bytes: await page.pdf({
        format: request.pdfPageSize, landscape: request.pdfOrientation === 'landscape',
        margin: { top: request.pdfTitle ? '24px' : '0', right: '0',
          bottom: request.pdfFooter ? '24px' : '0', left: '0' },
        displayHeaderFooter: Boolean(request.pdfTitle || request.pdfFooter),
        headerTemplate: text(request.pdfTitle), footerTemplate: text(request.pdfFooter),
        printBackground: true
      }), dimensions: size });
    }
  }
  return { artifacts: request.formats.map((format) => artifactsByFormat.get(format)!),
    canonicalSvg: decorated };
}

export async function raceAbortable<T>(
  operation: Promise<T>, signal: AbortSignal, closeLate?: (value: T) => Promise<void>
): Promise<T> {
  return abortable(operation, signal, async () => {}, closeLate);
}

class ExportSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private renderer?: Page;
  private capturePage?: Page;

  constructor(private readonly config: ExportServiceConfig) {}

  async open(signal?: AbortSignal, scale = 1): Promise<void> {
    const rendererPath = this.config.rendererPath ||
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../browser/archimate-js.js');
    try { await access(rendererPath, constants.R_OK); } catch { throw error('RENDER_BUILD_MISSING'); }
    const executable = await findChrome(this.config.chrome);
    try {
      this.browser = await abortable(chromium.launch({
        executablePath: executable, headless: true, chromiumSandbox: true
      }), signal, async () => {}, async (browser) => { await browser.close(); });
    } catch (value) { throw normalizeError(value, 'BROWSER_LAUNCH_FAILED'); }
    try {
      this.context = await abortable(this.browser.newContext({
        locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1024, height: 768 },
        deviceScaleFactor: scale
      }), signal, async () => { await this.close(); });
      await blockNetwork(this.context);
      this.renderer = await abortable(this.context.newPage(), signal, async () => { await this.close(); });
      await abortable(this.renderer.addScriptTag({ path: rendererPath }), signal, async () => { await this.close(); });
      this.capturePage = await abortable(this.context.newPage(), signal, async () => { await this.close(); });
    } catch (value) { await this.close(); throw normalizeError(value); }
  }

  async render(request: NormalizedRequest): Promise<ExportResult> {
    if (!this.renderer || !this.capturePage) throw error('VIEW_RENDER_FAILED');
    checkAbort(request.signal);
    const svg = await renderSvg(this.renderer, request, request.signal);
    const dimensions = svgBounds(svg);
    const width = (dimensions.width + request.padding * 2) * request.scale;
    const height = (dimensions.height + request.padding * 2) * request.scale;
    if (!Number.isFinite(width) || !Number.isFinite(height) ||
        width > MAX_DIMENSION || height > MAX_DIMENSION) throw error('EXPORT_DIMENSIONS_EXCEEDED');
    if (width * height > MAX_PIXELS) throw error('EXPORT_AREA_EXCEEDED');
    const captured = await abortable(capture(this.capturePage, svg, request),
      request.signal, async () => { await this.close(); });
    return { valid: true, diagnostics: [], ...captured };
  }

  async close(): Promise<void> {
    const browser = this.browser;
    const renderer = this.renderer;
    const capturePage = this.capturePage;
    this.browser = undefined;
    this.context = undefined;
    this.renderer = undefined;
    this.capturePage = undefined;
    await renderer?.close().catch(() => {});
    await capturePage?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

export function createExportService(config: ExportServiceConfig = {}) {
  const run = async (request: ExportRequest, session?: ExportSession): Promise<ExportResult> => {
    try {
      const normalized = normalize(request);
      const active = session || new ExportSession(config);
      if (!session) await active.open(normalized.signal, normalized.scale);
      try { return await active.render(normalized); }
      finally { if (!session) await active.close(); }
    } catch (value) { throw normalizeError(value); }
  };

  return {
    async exportView(request: ExportRequest): Promise<ExportResult> {
      return run(request);
    },
    async exportViews(
      requests: readonly ExportRequest[], continueOnError = false
    ): Promise<Array<ExportResult | { code: string }>> {
      if (!requests.length) return [];
      const normalized = requests.map(normalize);
      const scale = normalized[0].scale;
      if (normalized.some((request) => request.scale !== scale)) throw error('INVALID_OPTIONS');
      const session = new ExportSession(config);
      try {
        await session.open(normalized[0].signal, scale);
        const results: Array<ExportResult | { code: string }> = [];
        for (const request of normalized) {
          try { results.push(await run(request, session)); }
          catch (value) {
            if (!continueOnError) throw value;
            results.push({ code: normalizeError(value).code });
          }
        }
        return results;
      } catch (value) { throw normalizeError(value); }
      finally { await session.close(); }
    },
    async writeExport(request: ExportFileRequest): Promise<ExportFileResult> {
      try {
        if (!config.outputDirectory) throw error('INVALID_OPTIONS');
        const result = await run(request);
        const basename = (request.basename || 'view').normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-')
          .replace(/^[.-]+|[.-]+$/g, '').slice(0, 80) || 'view';
        await mkdir(config.outputDirectory, { recursive: true });
        const files = result.artifacts.map(({ format }) =>
          path.join(config.outputDirectory!, `${basename}.${format}`));
        const previous = await Promise.all(files.map(async (file) => ({
          file, value: await readFile(file).catch(() => undefined)
        })));
        try {
          for (const [index, artifact] of result.artifacts.entries()) {
            await writeAtomic(files[index], artifact.bytes);
          }
        } catch { await rollback(previous); throw error('OUTPUT_WRITE_FAILED'); }
        return { ...result, files };
      } catch (value) { throw normalizeError(value, 'OUTPUT_WRITE_FAILED'); }
    }
  };
}

const defaultService = createExportService();
export const exportView = defaultService.exportView;
export const exportViews = defaultService.exportViews;
export const writeExport = defaultService.writeExport;

async function writeAtomic(file: string, value: string | Uint8Array): Promise<void> {
  const temporary = `${file}.${Date.now()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(value);
    await handle.sync();
    await handle.close();
    await rename(temporary, file);
  } catch { await rm(temporary, { force: true }).catch(() => {}); throw error('OUTPUT_WRITE_FAILED'); }
}

async function rollback(previous: Array<{ file: string; value?: Uint8Array }>): Promise<void> {
  for (const item of previous.reverse()) {
    if (item.value) await writeAtomic(item.file, item.value);
    else await rm(item.file, { force: true });
  }
}

declare global {
  interface Window {
    ArchimateJS: { renderViewToSvg(options: {
      xml: string; viewId?: string; viewName?: string; width: number; height: number;
    }): Promise<string> };
  }
}
