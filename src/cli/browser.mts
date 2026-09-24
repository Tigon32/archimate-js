import type { ExportBackground } from '../export/types.mjs';
import type { ExportArtifacts, ExportOptions, RenderOptions } from './types.mjs';
import type { BrowserContext } from 'playwright-core';

type ExportServiceModule = {
  createExportService(config: { chrome?: string }): {
    exportView(request: Record<string, unknown>): Promise<{
      artifacts: Array<{ format: string; bytes: string | Uint8Array }>;
      canonicalSvg?: string;
    }>;
    exportViews(requests: Array<Record<string, unknown>>, continueOnError?: boolean): Promise<Array<{
      artifacts: Array<{ format: string; bytes: string | Uint8Array }>;
      canonicalSvg?: string;
    } | { code: string }>>;
  };
  blockNetwork(context: BrowserContext): Promise<void>;
};

async function loadExportService(): Promise<ExportServiceModule> {
  try {
    return await import(new URL('../export/index.mjs', import.meta.url).href) as ExportServiceModule;
  } catch (value) {
    if (value instanceof Error && 'code' in value && value.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('RENDER_BUILD_MISSING');
    }
    throw new Error('CLI_INTERNAL_ERROR');
  }
}

export async function blockNetwork(context: BrowserContext): Promise<void> {
  try {
    const shared = await loadExportService();
    await shared.blockNetwork(context);
  } catch (value) {
    if (value instanceof Error && value.message !== 'RENDER_BUILD_MISSING') throw value;
    await context.route('**/*', (route) => route.abort());
  }
}
export async function renderArtifacts(
  _packageRoot: string,
  xml: string,
  options: RenderOptions | ExportOptions
): Promise<ExportArtifacts> {
  const { createExportService } = await loadExportService();
  const service = createExportService({ chrome: options.chrome });
  const result = await service.exportView({
    xml, viewId: options.viewId, viewName: options.viewName,
    formats: options.command === 'render' ? ['svg'] : options.formats,
    scale: options.command === 'render' ? 1 : options.scale,
    background: (options.command === 'render' ? 'transparent' : options.background) as ExportBackground,
    fit: options.command === 'render' ? 'none' : options.fit,
    padding: options.command === 'render' ? 0 : options.padding,
    pdfPageSize: options.command === 'render' ? 'A4' : options.pdfPageSize,
    pdfOrientation: options.command === 'render' ? 'portrait' : options.pdfOrientation,
    pdfTitle: options.command === 'render' ? undefined : options.pdfTitle,
    pdfFooter: options.command === 'render' ? undefined : options.pdfFooter
  });
  return Object.fromEntries(result.artifacts.map((artifact) => [artifact.format, artifact.bytes]));
}

export async function renderBatchArtifacts(
  packageRoot: string,
  xml: string,
  requests: Array<RenderOptions | ExportOptions>
): Promise<ExportArtifacts[]> {
  const { createExportService } = await loadExportService();
  const service = createExportService({ chrome: requests[0]?.chrome });
  const results = await service.exportViews(requests.map((options) => ({
    xml, viewId: options.viewId, viewName: options.viewName,
    formats: options.command === 'render' ? ['svg'] : options.formats,
    scale: options.command === 'render' ? 1 : options.scale,
    background: (options.command === 'render' ? 'transparent' : options.background) as ExportBackground,
    fit: options.command === 'render' ? 'none' : options.fit,
    padding: options.command === 'render' ? 0 : options.padding,
    pdfPageSize: options.command === 'render' ? 'A4' : options.pdfPageSize,
    pdfOrientation: options.command === 'render' ? 'portrait' : options.pdfOrientation,
    pdfTitle: options.command === 'render' ? undefined : options.pdfTitle,
    pdfFooter: options.command === 'render' ? undefined : options.pdfFooter
  })));
  return results.map((result) => {
    if ('code' in result) throw new Error(result.code);
    return {
      ...Object.fromEntries(result.artifacts.map((artifact) => [artifact.format, artifact.bytes])),
      canonicalSvg: result.canonicalSvg
    };
  });
}

export type RenderOutcome = { artifacts: ExportArtifacts; code?: never } |
  { artifacts?: never; code: string };

export async function renderBatchOutcomes(
  packageRoot: string,
  xml: string,
  requests: Array<RenderOptions | ExportOptions>,
  continueOnError = true
): Promise<RenderOutcome[]> {
  const { createExportService } = await loadExportService();
  const service = createExportService({ chrome: requests[0]?.chrome });
  const mapped = requests.map((options) => ({
    xml, viewId: options.viewId, viewName: options.viewName,
    formats: options.command === 'render' ? ['svg'] : options.formats,
    scale: options.command === 'render' ? 1 : options.scale,
    background: (options.command === 'render' ? 'transparent' : options.background) as ExportBackground,
    fit: options.command === 'render' ? 'none' : options.fit,
    padding: options.command === 'render' ? 0 : options.padding,
    pdfPageSize: options.command === 'render' ? 'A4' : options.pdfPageSize,
    pdfOrientation: options.command === 'render' ? 'portrait' : options.pdfOrientation,
    pdfTitle: options.command === 'render' ? undefined : options.pdfTitle,
    pdfFooter: options.command === 'render' ? undefined : options.pdfFooter
  }));
  if (!continueOnError) {
    const results = await service.exportViews(mapped);
    return results.map((result) => {
      if ('code' in result) throw new Error(result.code);
      return { artifacts: {
        ...Object.fromEntries(result.artifacts.map((artifact) => [artifact.format, artifact.bytes])),
        canonicalSvg: result.canonicalSvg
      } };
    });
  }
  const results = await service.exportViews(mapped, true);
  return results.map((result) => 'code' in result ? result : { artifacts: {
    ...Object.fromEntries(result.artifacts.map((artifact) => [artifact.format, artifact.bytes])),
    canonicalSvg: result.canonicalSvg
  } });
}
