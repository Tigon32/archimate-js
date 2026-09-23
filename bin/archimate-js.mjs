#!/usr/bin/env node

import { constants } from 'node:fs';
import { access, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeAtomic } from './cli-io.mjs';

const MAX_XML_BYTES = 1_048_576;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SAFE_MESSAGES = Object.freeze({
  BROWSER_LAUNCH_FAILED: 'Unable to start the configured Chrome or Chromium executable.',
  BROWSER_NOT_FOUND: 'Chrome or Chromium was not found. Set CHROME_BIN or use --chrome.',
  CLI_INTERNAL_ERROR: 'The command could not be completed.',
  CLI_USAGE: 'Command options are invalid. Run archimate-js --help for usage.',
  INPUT_READ_FAILED: 'Unable to read the model file.',
  INPUT_SIZE_LIMIT: 'The ArchiMate model exceeds the supported size limit.',
  OUTPUT_WRITE_FAILED: 'Unable to write the SVG output file.'
});

function diagnostic(code, message = SAFE_MESSAGES[code]) {
  return { code, severity: 'error', layer: 'cli', message };
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  process.stdout.write(`Usage:
  archimate-js validate <model.xml>
  archimate-js render <model.xml> (--view-id <id> | --view-name <name>) --output <view.svg> [--chrome <path>]

Both commands emit structured JSON. Render requires an existing Chrome or Chromium installation.
`);
}

function parseArguments(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { command: 'help' };
  const [command, input, ...rest] = argv;
  if (!['validate', 'render'].includes(command) || !input || input.startsWith('-')) throw new Error('CLI_USAGE');
  if (command === 'validate') {
    if (rest.length) throw new Error('CLI_USAGE');
    return { command, input };
  }

  const parsed = { command, input };
  const allowed = new Map([
    ['--view-id', 'viewId'],
    ['--view-name', 'viewName'],
    ['--output', 'output'],
    ['--chrome', 'chrome']
  ]);
  for (let index = 0; index < rest.length; index += 2) {
    const key = allowed.get(rest[index]);
    const value = rest[index + 1];
    if (!key || !value || value.startsWith('-') || parsed[key] !== undefined) throw new Error('CLI_USAGE');
    parsed[key] = value;
  }
  if (!parsed.output || Boolean(parsed.viewId) === Boolean(parsed.viewName)) throw new Error('CLI_USAGE');
  if (path.resolve(parsed.input) === path.resolve(parsed.output)) throw new Error('CLI_USAGE');
  return parsed;
}

async function readBoundedXml(filePath) {
  let handle;
  try {
    handle = await open(filePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('INPUT_READ_FAILED');
    if (stat.size > MAX_XML_BYTES) throw new Error('INPUT_SIZE_LIMIT');
    const bytes = Buffer.alloc(MAX_XML_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_XML_BYTES) throw new Error('INPUT_SIZE_LIMIT');
    return bytes.subarray(0, bytesRead).toString('utf8');
  } catch (error) {
    if (error?.message === 'INPUT_SIZE_LIMIT') throw error;
    throw new Error('INPUT_READ_FAILED');
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function executablePath(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_BIN,
    ...String(process.env.PATH || '').split(path.delimiter).flatMap((directory) => [
      path.join(directory, 'google-chrome'),
      path.join(directory, 'chromium'),
      path.join(directory, 'chromium-browser')
    ]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through fixed executable candidates without exposing paths.
    }
  }
  throw new Error('BROWSER_NOT_FOUND');
}

async function renderSvg(xml, options) {
  const chrome = await executablePath(options.chrome);
  const bundlePath = path.join(packageRoot, 'dist/browser/archimate-js.js');
  try {
    await access(bundlePath, constants.R_OK);
  } catch {
    throw new Error('CLI_INTERNAL_ERROR');
  }

  const { chromium } = await import('playwright-core');
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chrome, headless: true, chromiumSandbox: true });
  } catch {
    throw new Error('BROWSER_LAUNCH_FAILED');
  }

  try {
    const context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'UTC',
      viewport: { width: 1024, height: 768 }
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.addScriptTag({ path: bundlePath });
    const result = await page.evaluate(async ({ model, viewId, viewName }) => {
      try {
        const svg = await window.ArchimateJS.renderViewToSvg({
          xml: model,
          viewId,
          viewName,
          width: 1024,
          height: 768
        });
        return { ok: true, svg };
      } catch (error) {
        return { ok: false, code: error?.code };
      }
    }, { model: xml, viewId: options.viewId, viewName: options.viewName });
    if (!result.ok) throw new Error(result.code || 'VIEW_RENDER_FAILED');
    return result.svg;
  } catch (error) {
    const knownCode = ['INVALID_OPTIONS', 'MODEL_TOO_LARGE', 'MODEL_IMPORT_FAILED', 'VIEW_NOT_FOUND', 'VIEW_NAME_AMBIGUOUS', 'VIEW_RENDER_FAILED', 'VIEW_SELECTION_FAILED', 'VIEWER_FAILURE']
      .includes(error?.message) ? error.message : 'VIEW_RENDER_FAILED';
    throw new Error(knownCode);
  } finally {
    await browser.close().catch(() => {});
  }
}

function renderDiagnostic(error) {
  const publicMessages = {
    INVALID_OPTIONS: 'Viewer options are invalid.',
    MODEL_TOO_LARGE: 'The ArchiMate model exceeds the supported size limit.',
    MODEL_IMPORT_FAILED: 'Unable to load the ArchiMate model.',
    VIEW_NOT_FOUND: 'The requested ArchiMate view was not found.',
    VIEW_NAME_AMBIGUOUS: 'The requested ArchiMate view name is ambiguous.',
    VIEW_RENDER_FAILED: 'Unable to render the requested ArchiMate view.',
    VIEW_SELECTION_FAILED: 'Unable to open the requested ArchiMate view.',
    VIEWER_FAILURE: 'Unable to render the ArchiMate view.'
  };
  const code = SAFE_MESSAGES[error?.message] || publicMessages[error?.message]
    ? error.message
    : 'CLI_INTERNAL_ERROR';
  return diagnostic(code, SAFE_MESSAGES[code] || publicMessages[code]);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch {
    emit({ command: 'unknown', valid: false, diagnostics: [diagnostic('CLI_USAGE')], suggestions: [] });
    return 2;
  }
  if (options.command === 'help') {
    usage();
    return 0;
  }

  let xml;
  try {
    xml = await readBoundedXml(options.input);
  } catch (error) {
    const code = SAFE_MESSAGES[error?.message] ? error.message : 'INPUT_READ_FAILED';
    emit({ command: options.command, valid: false, diagnostics: [diagnostic(code)], suggestions: [] });
    return 1;
  }

  let validateArchimateXml;
  try {
    ({ validateArchimateXml } = await import('../dist/validator/index.js'));
  } catch {
    emit({ command: options.command, valid: false, diagnostics: [diagnostic('CLI_INTERNAL_ERROR')], suggestions: [] });
    return 1;
  }

  const validation = validateArchimateXml(xml);
  if (options.command === 'validate' || !validation.valid) {
    emit({ command: options.command, valid: validation.valid, diagnostics: validation.diagnostics, suggestions: validation.suggestions });
    return validation.valid ? 0 : 1;
  }

  try {
    const svg = await renderSvg(xml, options);
    await writeAtomic(options.output, svg);
    emit({ command: 'render', valid: true, diagnostics: validation.diagnostics, suggestions: validation.suggestions });
    return 0;
  } catch (error) {
    emit({ command: 'render', valid: false, diagnostics: [renderDiagnostic(error)], suggestions: [] });
    return 1;
  }
}

try {
  process.exitCode = await main();
} catch {
  emit({ command: 'unknown', valid: false, diagnostics: [diagnostic('CLI_INTERNAL_ERROR')], suggestions: [] });
  process.exitCode = 1;
}
