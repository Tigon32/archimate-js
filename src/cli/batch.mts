import { createHash } from 'node:crypto';

import type { ExportArtifacts, ExportFormat } from './types.mjs';
import type { BatchView } from './views.mjs';

type BatchFile = { filename: string; contents: string | Uint8Array };
export type BatchEntry = {
  viewId: string; viewName: string; status: 'success' | 'failed' | 'skipped';
  outputs: Array<{ format: ExportFormat; path: string; dimensions: { width: number; height: number }; sha256: string }>;
  diagnostics: Array<{ code: string }>;
};
const CANONICAL_FORMATS: readonly ExportFormat[] = ['svg', 'png', 'pdf'];

function dimensions(svg: string): { width: number; height: number } {
  const opening = svg.match(/^<svg\b[^>]*>/)?.[0] ?? '';
  const match = opening.match(/\bviewBox="([^"]+)"/);
  const values = match?.[1].split(/\s+/).map(Number) ?? [];
  if (values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) {
    throw new Error('VIEW_RENDER_FAILED');
  }
  return { width: values[2], height: values[3] };
}

export function prepareBatch(
  views: BatchView[], artifacts: ExportArtifacts[], formats: ExportFormat[]
): { files: BatchFile[]; manifest: string } {
  const requested = CANONICAL_FORMATS.filter((format) => formats.includes(format));
  const files: BatchFile[] = [];
  const entries = views.map((view, index) => {
    const contents = artifacts[index];
    const canonical = typeof contents.svg === 'string' ? contents.svg : contents.canonicalSvg;
    if (typeof canonical !== 'string') throw new Error('VIEW_RENDER_FAILED');
    const size = dimensions(canonical);
    const outputs = requested.map((format) => {
      const value = contents[format];
      if (value === undefined) throw new Error('VIEW_RENDER_FAILED');
      const filename = `${view.basename}.${format}`;
      files.push({ filename, contents: value });
      return {
        format, path: filename, dimensions: size,
        sha256: createHash('sha256').update(value).digest('hex')
      };
    });
    return { viewId: view.id, viewName: view.name, outputs, diagnostics: [] };
  });
  return { files, manifest: `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n` };
}

export function preparePartialView(view: BatchView, artifacts: ExportArtifacts, formats: ExportFormat[]):
  { files: BatchFile[]; entry: BatchEntry } {
  const batch = prepareBatch([view], [artifacts], formats);
  const entry = (JSON.parse(batch.manifest) as { entries: BatchEntry[] }).entries[0];
  return { files: batch.files, entry: { ...entry, status: 'success' } };
}

export function failedBatchEntry(view: BatchView, code: string): BatchEntry {
  return { viewId: view.id, viewName: view.name, status: 'failed', outputs: [], diagnostics: [{ code }] };
}

export function partialManifest(entries: BatchEntry[]): string {
  const overallStatus = entries.some((entry) => entry.status !== 'success') ? 'partial_failure' : 'success';
  return `${JSON.stringify({ schemaVersion: 2, policy: 'continue-on-error', overallStatus, entries }, null, 2)}\n`;
}
