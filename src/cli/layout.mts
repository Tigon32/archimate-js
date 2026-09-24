import type { ExportOptions, FitMode } from './types.mjs';

export const MAX_RENDER_DIMENSION = 32_768;
export const MAX_RENDER_PIXELS = 64_000_000;
export const MAX_PADDING = 1_024;

export type SvgBounds = { x: number; y: number; width: number; height: number };

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function parseNumber(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('EXPORT_DIMENSIONS_INVALID');
  return parsed;
}

export function svgBounds(svg: string): SvgBounds {
  const root = svg.match(/^<svg\b([^>]*)>/);
  const viewBox = root?.[1].match(/\bviewBox="([^"]+)"/i)?.[1].trim().split(/\s+/);
  const width = root?.[1].match(/\bwidth="([^"]+)"/i)?.[1];
  const height = root?.[1].match(/\bheight="([^"]+)"/i)?.[1];
  const values = viewBox?.map(Number);
  const bounds = values?.length === 4
    ? { x: values[0], y: values[1], width: values[2], height: values[3] }
    : { x: 0, y: 0, width: parseNumber(width), height: parseNumber(height) };
  if (!finitePositive(bounds.width) || !finitePositive(bounds.height) ||
      !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
    throw new Error('EXPORT_DIMENSIONS_INVALID');
  }
  return bounds;
}

function replaceRootAttribute(svg: string, name: string, value: string): string {
  const root = svg.match(/^<svg\b([^>]*)>/);
  if (!root) throw new Error('EXPORT_DIMENSIONS_INVALID');
  const escaped = value.replace(/"/g, '&quot;');
  const attribute = new RegExp(`\\s${name}="[^"]*"`, 'i');
  const attrs = attribute.test(root[1])
    ? root[1].replace(attribute, ` ${name}="${escaped}"`)
    : `${root[1]} ${name}="${escaped}"`;
  return `<svg${attrs}>${svg.slice(root[0].length)}`;
}

export function applyLayout(svg: string, padding: number, fit: FitMode): string {
  if (padding === 0 && fit === 'none') return svg;
  const bounds = svgBounds(svg);
  const padded = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2
  };
  const viewBox = `${padded.x} ${padded.y} ${padded.width} ${padded.height}`;
  let result = replaceRootAttribute(
    replaceRootAttribute(
      replaceRootAttribute(svg, 'viewBox', viewBox),
      'width', String(padded.width)
    ),
    'height', String(padded.height)
  );
  if (fit !== 'none') {
    result = replaceRootAttribute(result, 'preserveAspectRatio',
      `xMidYMid ${fit === 'cover' ? 'slice' : 'meet'}`);
  }
  return result;
}

export function validateLayout(svg: string, options: ExportOptions): void {
  const bounds = svgBounds(svg);
  const width = (bounds.width + options.padding * 2) * options.scale;
  const height = (bounds.height + options.padding * 2) * options.scale;
  if (!finitePositive(width) || !finitePositive(height) ||
      width > MAX_RENDER_DIMENSION || height > MAX_RENDER_DIMENSION) {
    throw new Error('EXPORT_DIMENSIONS_EXCEEDED');
  }
  if (width * height > MAX_RENDER_PIXELS) throw new Error('EXPORT_AREA_EXCEEDED');
}
