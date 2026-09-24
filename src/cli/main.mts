#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArguments } from './arguments.mjs';
import { renderArtifacts } from './browser.mjs';
import { diagnostic, safeErrorCode } from './diagnostics.mjs';
import { readBoundedXml, writeArtifacts, writeAtomic } from './io.mjs';
import type { CliOptions, CliResult, ExportOptions, RenderOptions } from './types.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function emit(value: CliResult): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write(`Usage:
  archimate-js validate <model.xml>
  archimate-js render <model.xml> (--view-id <id> | --view-name <name>) --output <view.svg> [--chrome <path>]
  archimate-js export <model.xml> (--view-id <id> | --view-name <name>) --format <svg,png,pdf> --output-dir <dir>
    [--basename <name>] [--scale <1..4>] [--background <transparent|white|black|#RRGGBB>]
    [--pdf-page-size <A3|A4|A5|Legal|Letter>] [--pdf-orientation <portrait|landscape>] [--chrome <path>]

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

async function exportCommand(xml: string, options: ExportOptions): Promise<void> {
  const artifacts = await renderArtifacts(packageRoot, xml, options);
  try {
    await writeArtifacts(options.outputDirectory, options.basename, artifacts);
  } catch (error) {
    if (error instanceof Error && error.message === 'OUTPUT_WRITE_FAILED') {
      throw new Error('EXPORT_OUTPUT_WRITE_FAILED');
    }
    throw error;
  }
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
    else await exportCommand(xml, options);
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
