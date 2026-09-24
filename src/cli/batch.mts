import { createHash } from 'node:crypto';

import type { ExportArtifacts, ExportFormat } from './types.mjs';
import type { BatchView } from './views.mjs';

type BatchFile = { filename: string; contents: string | Uint8Array };

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
  const files: BatchFile[] = [];
  const entries = views.map((view, index) => {
    const contents = artifacts[index];
    // Canonical bounds are available even when SVG is not a requested output.
    if (typeof contents.svg !== 'string') throw new Error('VIEW_RENDER_FAILED');
    const size = dimensions(contents.svg);
    const outputs = formats.map((format) => {
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
