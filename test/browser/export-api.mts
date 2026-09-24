import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ExportArtifact, ExportFileResult, ExportRequest, ExportResult,
  ExportServiceConfig } from '../../src/export/types.mjs';

type ExportService = {
  exportView(request: ExportRequest): Promise<ExportResult>;
  exportViews(requests: readonly ExportRequest[]): Promise<ExportResult[]>;
  writeExport(request: ExportRequest & { basename?: string }): Promise<ExportFileResult>;
};
type ExportModule = {
  createExportService(config?: ExportServiceConfig): ExportService;
  exportView(request: ExportRequest): Promise<ExportResult>;
};
type RaceAbortable = <T>(
  operation: Promise<T>, signal: AbortSignal | undefined,
  onLateResolve: (value: T) => Promise<void>
) => Promise<T>;

const exportModulePath = '../../dist/export/index.mjs';
const serviceModulePath = '../../dist/export/service.mjs';
const { createExportService, exportView } =
  await import(exportModulePath) as ExportModule;
const { raceAbortable } =
  await import(serviceModulePath) as { raceAbortable: RaceAbortable };

const root = path.resolve(import.meta.dirname, '../..');
const xml = await readFile(path.join(root, 'test/fixtures/synthetic/minimal-application-view.xml'), 'utf8');
const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-export-api-'));

try {
  const result = await exportView({
    xml, viewId: 'view-synthetic-minimal', formats: ['pdf', 'png', 'svg'],
    scale: 2, background: 'white', fit: 'contain', padding: 12
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.artifacts.map(({ format }: ExportArtifact) => format), ['svg', 'png', 'pdf']);
  assert.match(String(result.artifacts[0].bytes), /^<svg[^>]+role="(?:img|graphics-document document)"/);
  assert.equal(Buffer.from(result.artifacts[1].bytes).subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a');
  assert.equal(Buffer.from(result.artifacts[2].bytes).subarray(0, 5).toString(), '%PDF-');

  const service = createExportService({ outputDirectory: directory });
  const written = await service.writeExport({
    xml, viewName: 'Synthetic Minimal View', formats: ['svg'],
    basename: 'safe / report'
  });
  assert.deepEqual(written.files.map((file: string) => path.basename(file)), ['safe-report.svg']);
  assert.match(await readFile(written.files[0], 'utf8'), /^<svg/);

  await assert.rejects(exportView({ xml, viewId: 'private-view-id', formats: ['svg'] }),
    (error) => error instanceof Error && 'code' in error && error.code === 'VIEW_NOT_FOUND');
  await assert.rejects(exportView({ xml: '<model/>', viewId: 'view', formats: ['svg'] }),
    (error) => error instanceof Error && 'code' in error && error.code === 'MODEL_IMPORT_FAILED');
  await assert.rejects(exportView({
    xml, viewId: 'view-synthetic-minimal', formats: ['svg'], signal: AbortSignal.abort()
  }), (error) => error instanceof Error && 'code' in error && error.code === 'EXPORT_ABORTED');
  const mixedScaleService = createExportService({ chrome: path.join(directory, 'unused') });
  await assert.rejects(mixedScaleService.exportViews([
    { xml, viewId: 'view-synthetic-minimal', formats: ['svg'], scale: 1 },
    { xml, viewId: 'view-synthetic-minimal', formats: ['svg'], scale: 2 }
  ]), (error) => error instanceof Error && 'code' in error && error.code === 'INVALID_OPTIONS');
  let resolveLaunch: ((value: { close(): Promise<void> }) => void) | undefined;
  let closed = false;
  const launch = new Promise<{ close(): Promise<void> }>((resolve) => { resolveLaunch = resolve; });
  const controller = new AbortController();
  const abortedLaunch = raceAbortable(launch, controller.signal,
    async (browser: { close(): Promise<void> }) => {
    closed = true;
    await browser.close();
  });
  controller.abort();
  await assert.rejects(abortedLaunch, (error) => error instanceof Error &&
    'code' in error && error.code === 'EXPORT_ABORTED');
  resolveLaunch?.({ close: async () => { closed = true; } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(closed, true);
  assert.equal((await readdir(directory)).length, 1);
  const missingBrowser = createExportService({ chrome: path.join(directory, 'missing-browser') });
  await assert.rejects(missingBrowser.exportView({
    xml, viewId: 'view-synthetic-minimal', formats: ['svg']
  }), (error) => error instanceof Error && 'code' in error &&
    error.code === 'BROWSER_NOT_FOUND' && !String(error).includes(directory));
  const missingBuild = createExportService({ rendererPath: path.join(directory, 'private-renderer.js') });
  await assert.rejects(missingBuild.exportView({
    xml, viewId: 'view-synthetic-minimal', formats: ['svg']
  }), (error) => error instanceof Error && 'code' in error &&
    error.code === 'RENDER_BUILD_MISSING' && !String(error).includes(directory));
  console.log('direct export API browser test passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}

process.exit(0);
