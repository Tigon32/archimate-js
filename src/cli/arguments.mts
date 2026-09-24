import path from 'node:path';

import type {
  CliOptions,
  ExportFormat,
  ExportOptions,
  PdfOrientation,
  PdfPageSize,
  FitMode,
  RenderOptions
} from './types.mjs';
import { MAX_PADDING } from './layout.mjs';

const FORMATS = new Set<ExportFormat>(['svg', 'png', 'pdf']);
const PAGE_SIZES = new Set<PdfPageSize>(['A3', 'A4', 'A5', 'Legal', 'Letter']);
const ORIENTATIONS = new Set<PdfOrientation>(['portrait', 'landscape']);
const FITS = new Set<FitMode>(['none', 'contain', 'cover']);
const BACKGROUND = /^(?:transparent|white|black|#[0-9a-fA-F]{6})$/;

function requireValue(arguments_: string[], index: number): string {
  const value = arguments_[index + 1];
  if (!value || value.startsWith('-')) throw new Error('CLI_USAGE');
  return value;
}

function parseRender(input: string, rest: string[]): RenderOptions {
  const parsed: Partial<RenderOptions> = { command: 'render', input };
  const allowed: Record<string, keyof RenderOptions> = {
    '--view-id': 'viewId', '--view-name': 'viewName',
    '--output': 'output', '--chrome': 'chrome'
  };
  for (let index = 0; index < rest.length; index += 2) {
    const key = allowed[rest[index]];
    const value = requireValue(rest, index);
    if (!key || parsed[key] !== undefined) throw new Error('CLI_USAGE');
    Object.assign(parsed, { [key]: value });
  }
  if (!parsed.output || Boolean(parsed.viewId) === Boolean(parsed.viewName)) throw new Error('CLI_USAGE');
  if (path.resolve(input) === path.resolve(parsed.output)) throw new Error('CLI_USAGE');
  return parsed as RenderOptions;
}

function addFormats(target: Set<ExportFormat>, value: string): void {
  const values = value.split(',').filter(Boolean);
  if (!values.length) throw new Error('CLI_USAGE');
  for (const format of values) {
    if (!FORMATS.has(format as ExportFormat) || target.has(format as ExportFormat)) {
      throw new Error('CLI_USAGE');
    }
    target.add(format as ExportFormat);
  }
}

function exportDefaults(input: string): Partial<ExportOptions> {
  return {
    command: 'export',
    input,
    basename: 'view',
    scale: 1,
    background: 'white',
    pdfPageSize: 'A4',
    pdfOrientation: 'portrait',
    fit: 'none',
    padding: 0
  };
}

function assignExportOption(
  parsed: Partial<ExportOptions>,
  seen: Set<string>,
  option: string,
  value: string
): void {
  const keys: Record<string, keyof ExportOptions> = {
    '--view-id': 'viewId', '--view-name': 'viewName', '--output-dir': 'outputDirectory',
    '--basename': 'basename', '--background': 'background', '--pdf-page-size': 'pdfPageSize',
    '--pdf-orientation': 'pdfOrientation', '--fit': 'fit', '--padding': 'padding',
    '--pdf-title': 'pdfTitle', '--pdf-footer': 'pdfFooter', '--chrome': 'chrome'
  };
  const key = keys[option];
  if (!key || seen.has(option)) throw new Error('CLI_USAGE');
  seen.add(option);
  Object.assign(parsed, { [key]: value });
}

function validateExport(parsed: Partial<ExportOptions>, formats: Set<ExportFormat>): ExportOptions {
  if (!parsed.outputDirectory ||
      Number(Boolean(parsed.viewId)) + Number(Boolean(parsed.viewName)) + Number(Boolean(parsed.allViews)) !== 1 ||
      !formats.size) {
    throw new Error('CLI_USAGE');
  }
  if (!Number.isInteger(parsed.scale) || parsed.scale! < 1 || parsed.scale! > 4) throw new Error('CLI_USAGE');
  if (!BACKGROUND.test(parsed.background!) || !PAGE_SIZES.has(parsed.pdfPageSize as PdfPageSize) ||
      !ORIENTATIONS.has(parsed.pdfOrientation as PdfOrientation) ||
      !FITS.has(parsed.fit as FitMode) || !Number.isFinite(parsed.padding) ||
      parsed.padding! < 0 || parsed.padding! > MAX_PADDING) throw new Error('CLI_USAGE');
  if (parsed.pdfTitle && parsed.pdfTitle.length > 200 || parsed.pdfFooter && parsed.pdfFooter.length > 200) {
    throw new Error('CLI_USAGE');
  }
  if ((parsed.pdfTitle || parsed.pdfFooter) && !formats.has('pdf')) throw new Error('CLI_USAGE');
  if (formats.has('pdf') && parsed.background === 'transparent') {
    throw new Error('PDF_TRANSPARENT_BACKGROUND');
  }
  if ([...formats].some((format) =>
    path.resolve(parsed.input!) === path.resolve(parsed.outputDirectory!, `${parsed.basename}.${format}`))) {
    throw new Error('CLI_USAGE');
  }
  return { ...parsed, formats: [...formats] } as ExportOptions;
}

function parseExport(input: string, rest: string[]): ExportOptions {
  const parsed = exportDefaults(input);
  const formats = new Set<ExportFormat>();
  const seen = new Set<string>();
  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index];
    if (option === '--all-views' || option === '--continue-on-error') {
      if (seen.has(option)) throw new Error('CLI_USAGE');
      seen.add(option);
      if (option === '--all-views') parsed.allViews = true;
      else parsed.continueOnError = true;
      index -= 1;
      continue;
    }
    const value = requireValue(rest, index);
    if (option === '--format') addFormats(formats, value);
    else if (option === '--scale') {
      if (seen.has(option)) throw new Error('CLI_USAGE');
      seen.add(option);
      parsed.scale = Number(value);
    } else if (option === '--padding') {
      if (seen.has(option)) throw new Error('CLI_USAGE');
      seen.add(option);
      parsed.padding = Number(value);
    } else assignExportOption(parsed, seen, option, value);
  }
  if (parsed.allViews && seen.has('--basename')) throw new Error('CLI_USAGE');
  if (parsed.continueOnError && !parsed.allViews) throw new Error('CLI_USAGE');
  parsed.basename = sanitizeBasename(parsed.basename!);
  return validateExport(parsed, formats);
}

export function sanitizeBasename(value: string): string {
  const sanitized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80);
  if (!sanitized) throw new Error('CLI_USAGE');
  return sanitized;
}

export function parseArguments(argv: string[]): CliOptions {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { command: 'help' };
  const [command, input, ...rest] = argv;
  if (!['validate', 'render', 'export'].includes(command) || !input || input.startsWith('-')) {
    throw new Error('CLI_USAGE');
  }
  if (command === 'validate') {
    if (rest.length) throw new Error('CLI_USAGE');
    return { command, input };
  }
  return command === 'render' ? parseRender(input, rest) : parseExport(input, rest);
}
