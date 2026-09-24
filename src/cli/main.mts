#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArguments } from './arguments.mjs';
import { renderArtifacts, renderBatchArtifacts, renderBatchOutcomes } from './browser.mjs';
import { failedBatchEntry, partialManifest, prepareBatch, preparePartialView } from './batch.mjs';
import { diagnostic, safeErrorCode } from './diagnostics.mjs';
import { readBoundedXml, writeArtifacts, writeAtomic, writeBatchArtifacts, writePartialBatchArtifacts } from './io.mjs';
import { listBatchViews } from './views.mjs';
import type { CliOptions, CliResult, ExportOptions, RenderOptions } from './types.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function emit(value: CliResult): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write(`Usage:
  archimate-js validate <model.xml>
  archimate-js render <model.xml> (--view-id <id> | --view-name <name>) --output <view.svg> [--chrome <path>]
  archimate-js export <model.xml> (--view-id <id> | --view-name <name> | --all-views) --format <svg,png,pdf> --output-dir <dir>
    [--basename <name>] [--scale <1..4>] [--background <transparent|white|black|#RRGGBB>]
    [--fit <none|contain|cover>] [--padding <0..1024>]
    [--pdf-page-size <A3|A4|A5|Legal|Letter>] [--pdf-orientation <portrait|landscape>]
    [--pdf-title <text>] [--pdf-footer <text>] [--chrome <path>]
    [--continue-on-error (requires --all-views)]

Commands emit structured JSON. Rendering requires an existing Chrome or Chromium installation.
`);
}

function failure(command: string, code: string): CliResult {
  return { command, valid: false, diagnostics: [diagnostic(code)], suggestions: [] };
}

async function renderCommand(xml: string, options: RenderOptions): Promise<void> {
  const artifacts = await renderArtifacts(packageRoot, xml, options);
  await writeAtomic(options.output, artifacts.svg!);
}

async function exportCommand(xml: string, options: ExportOptions): Promise<boolean> {
  if (options.allViews) {
    const views = listBatchViews(xml);
    const requests = views.map((view) => ({ ...options, viewId: view.id, viewName: undefined }));
    if (options.continueOnError) {
      const outcomes = await renderBatchOutcomes(packageRoot, xml, requests);
      const prepared = outcomes.map((outcome, index) => outcome.artifacts
        ? preparePartialView(views[index], outcome.artifacts, options.formats) : undefined);
      const entries = outcomes.map((outcome, index) => prepared[index]?.entry ??
        failedBatchEntry(views[index], outcome.code!));
      const groups = prepared.map((item) => ({ files: item?.files ?? [] }));
      const failed = await writePartialBatchArtifacts(options.outputDirectory, groups, options.input,
        (indexes) => partialManifest(entries.map((entry, index) => indexes.has(index)
          ? failedBatchEntry(views[index], 'OUTPUT_WRITE_FAILED') : entry)));
      return entries.every((entry) => entry.status === 'success') && !failed.size;
    }
    const artifacts = await renderBatchArtifacts(packageRoot, xml, requests);
    const batch = prepareBatch(views, artifacts, options.formats);
    await writeBatchArtifacts(options.outputDirectory, batch.files, batch.manifest, options.input);
    return true;
  }
  const artifacts = await renderArtifacts(packageRoot, xml, options);
  try {
    await writeArtifacts(options.outputDirectory, options.basename, artifacts);
  } catch (error) {
    if (error instanceof Error && error.message === 'OUTPUT_WRITE_FAILED') {
      throw new Error('EXPORT_OUTPUT_WRITE_FAILED');
    }
    throw error;
  }
  return true;
}

async function execute(options: Exclude<CliOptions, { command: 'help' }>, xml: string): Promise<number> {
  type Validate = (xml: string) => {
    valid: boolean;
    diagnostics: CliResult['diagnostics'];
    suggestions: CliResult['suggestions'];
  };
  let validateArchimateXml: Validate;
  try {
    const validatorPath = new URL('../validator/index.js', import.meta.url).href;
    const validatorModule: unknown = await import(validatorPath);
    if (!validatorModule || typeof validatorModule !== 'object' ||
        !('validateArchimateXml' in validatorModule) ||
        typeof validatorModule.validateArchimateXml !== 'function') throw new Error();
    validateArchimateXml = validatorModule.validateArchimateXml as Validate;
  } catch {
    emit(failure(options.command, 'CLI_INTERNAL_ERROR'));
    return 1;
  }
  const validation = validateArchimateXml(xml);
  if (options.command === 'validate' || !validation.valid) {
    emit({
      command: options.command, valid: validation.valid,
      diagnostics: validation.diagnostics, suggestions: validation.suggestions
    });
    return validation.valid ? 0 : 1;
  }
  try {
    if (options.command === 'render') await renderCommand(xml, options);
    else if (!await exportCommand(xml, options)) {
      emit(failure(options.command, 'BATCH_PARTIAL_FAILURE'));
      return 1;
    }
    emit({
      command: options.command, valid: true, diagnostics: validation.diagnostics,
      suggestions: validation.suggestions,
      ...(options.command === 'export' ? { formats: options.formats } : {})
    });
    return 0;
  } catch (error) {
    emit(failure(options.command, safeErrorCode(error)));
    return 1;
  }
}

async function main(): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    emit(failure('unknown', safeErrorCode(error) === 'PDF_TRANSPARENT_BACKGROUND'
      ? 'PDF_TRANSPARENT_BACKGROUND' : 'CLI_USAGE'));
    return 2;
  }
  if (options.command === 'help') {
    usage();
    return 0;
  }
  try {
    return await execute(options, await readBoundedXml(options.input));
  } catch (error) {
    emit(failure(options.command, safeErrorCode(error)));
    return 1;
  }
}

try {
  process.exitCode = await main();
} catch {
  emit(failure('unknown', 'CLI_INTERNAL_ERROR'));
  process.exitCode = 1;
}
