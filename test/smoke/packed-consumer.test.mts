import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Stats, WebpackError } from 'webpack';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-release-consumer-'));
const run = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): string => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.error?.message || '').trim().split('\n').slice(-8).join('\n');
    throw new Error(`Packed consumer check failed (${command} ${args[0]}): ${detail}`);
  }
  return result.stdout;
};

try {
  run(process.execPath, ['test/smoke/compile-validator.mjs'], { cwd: root });
  run('npm', ['run', 'compile:model-dto'], { cwd: root });
  run('npm', ['run', 'compile:layout'], { cwd: root });
  run('npm', ['run', 'compile:export'], { cwd: root });
  run(process.execPath, ['test/smoke/compile.mts'], { cwd: root });
  run('npm', ['run', 'compile:cli'], { cwd: root });
  const packOutput = run('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', temp
  ], { cwd: root });
  const [packed] = JSON.parse(packOutput);
  const archive = path.join(temp, packed.filename);
  const consumer = path.join(temp, 'consumer');
  await mkdir(consumer, { recursive: true });
  await writeFile(path.join(consumer, 'package.json'), '{"private":true}\n');
  run('npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', archive
  ], { cwd: consumer });

  const dtoImportProbe = spawnSync(process.execPath, [
    '--input-type=module', '-e', `
      import { importMeffToModelDto } from 'archimate-js/model-dto';
      const model = importMeffToModelDto('<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" identifier="probe"><name>Probe</name></model>');
      if (model.id !== 'probe') process.exitCode = 1;
    `
  ], { cwd: consumer, encoding: 'utf8' });
  assert.equal(dtoImportProbe.status, 0, 'packed model DTO API must import directly in Node');
  assert.equal(dtoImportProbe.stderr, '', 'packed model DTO API must not emit module warnings');

  const packageRoot = path.join(consumer, 'node_modules', 'archimate-js');

  const consumerEntry = path.join(consumer, 'consumer-entry.mjs');
  await writeFile(consumerEntry, `
    import Viewer, { mountViewer, renderViewToSvg } from 'archimate-js';
    import { importMeffToModelDto, exportModelDtoToMeff,
      createAccessibleOutline, formatAccessibleOutline } from 'archimate-js/model-dto';
    import { layoutView } from 'archimate-js/layout';
    export default {
      viewer: typeof Viewer,
      mountViewer: typeof mountViewer,
      renderViewToSvg: typeof renderViewToSvg,
      dtoImport: typeof importMeffToModelDto,
      dtoExport: typeof exportModelDtoToMeff,
      outline: typeof createAccessibleOutline,
      outlineText: typeof formatAccessibleOutline,
      layoutView: typeof layoutView
    };
  `);
  const require = createRequire(path.join(root, 'package.json'));
  const webpack = require('webpack');
  const bundlePath = path.join(consumer, 'consumer.cjs');
  await new Promise<void>((resolve, reject) => webpack({
    mode: 'production',
    target: 'node',
    entry: consumerEntry,
    output: { path: consumer, filename: path.basename(bundlePath), library: { type: 'commonjs2' } },
  }, (error: WebpackError | null, stats?: Stats) => {
    if (error || !stats || stats.hasErrors()) {
      reject(new Error('Bundler could not resolve the packed root API.'));
      return;
    }
    resolve();
  }));
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const rootApi = require(bundlePath).default;
  assert.deepEqual(rootApi, { viewer: 'function', mountViewer: 'function',
    renderViewToSvg: 'function', dtoImport: 'function', dtoExport: 'function',
    outline: 'function', outlineText: 'function',
    layoutView: 'function' });
  const exportSubpath = [ 'archimate-js', 'export' ].join('/');
  const exportApi = await import(exportSubpath) as {
    exportView: Function;
    writeExport: Function;
    createExportService(config?: { chrome?: string; outputDirectory?: string }): {
      exportView(request: Record<string, unknown>): Promise<{
        valid: boolean; artifacts: Array<{ bytes: string | Uint8Array }>;
      }>;
      exportViews(requests: readonly Record<string, unknown>[]): Promise<unknown[]>;
      writeExport(request: Record<string, unknown>): Promise<unknown>;
    };
  };
  assert.equal(typeof exportApi.exportView, 'function');
  assert.equal(typeof exportApi.createExportService, 'function');
  assert.equal(typeof exportApi.writeExport, 'function');
  assert.deepEqual(await exportApi.createExportService().exportViews([]), []);
  const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  try {
    await access(chrome, constants.X_OK);
    const fixture = await readFile(
      path.join(root, 'test/fixtures/synthetic/minimal-application-view.xml'), 'utf8');
    const success = await exportApi.createExportService({ chrome }).exportView({
      xml: fixture, viewId: 'view-synthetic-minimal', formats: ['svg']
    });
    assert.equal(success.valid, true);
    assert.match(String(success.artifacts[0].bytes), /^<svg/);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        (error as NodeJS.ErrnoException).code !== 'EACCES') throw error;
  }
  await assert.rejects(exportApi.exportView({
    xml: '<model/>', viewId: 'view', formats: ['svg']
  }), (error) => error instanceof Error && 'code' in error &&
    ['INVALID_OPTIONS', 'MODEL_IMPORT_FAILED', 'VIEW_RENDER_FAILED', 'OUTPUT_WRITE_FAILED']
      .includes(String(error.code)),
  'packed export invalid XML');
  const outputDirectory = path.join(consumer, 'export-output');
  const exportService = exportApi.createExportService({
    chrome: '/definitely/missing/chrome', outputDirectory
  });
  await assert.rejects(exportService.exportView({
    xml: '<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" identifier="synthetic-model"><name>Synthetic</name></model>',
    viewId: 'missing-private-view', formats: ['svg']
  }), (error) => error instanceof Error && 'code' in error &&
    error.code === 'BROWSER_NOT_FOUND' && !String(error).includes('/definitely'),
  'packed export browser failure');
  await assert.rejects(exportService.writeExport({
    xml: '<model/>', viewId: 'view', formats: ['svg'], basename: 'unsafe'
  }), (error) => error instanceof Error && 'code' in error &&
    ['BROWSER_NOT_FOUND', 'MODEL_IMPORT_FAILED', 'VIEW_RENDER_FAILED', 'OUTPUT_WRITE_FAILED']
      .includes(String(error.code)) && !String(error).includes('/definitely'),
  'packed write invalid XML');
  await assert.rejects(readFile(outputDirectory, 'utf8'));

  const consumerScript = String.raw`
    import assert from 'node:assert/strict';
    const validator = await import('archimate-js/validator');
    assert.equal(validator.ARCHIMATE_LANGUAGE_VERSION, '3.2');
    assert.equal(validator.RELATIONSHIP_SEMANTIC_ROWS.length, 23);
    assert.equal(validator.validateRelationshipSemantics({
      sourceType: 'ApplicationFunction', relationshipType: 'AccessRelationship', targetType: 'DataObject'
    }).decision, 'allowed');
    assert.equal(typeof validator.validateArchimateXml, 'function');
    const result = validator.validateArchimateXml(
      '<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" id="synthetic-model"><name>Synthetic</name></model>'
    );
    assert.equal(result.valid, true);

    // SYNTHETIC: Minimal public MEFF model with no private architecture data.
    const dto = await import('archimate-js/model-dto');
    const xml = '<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" identifier="synthetic-model"><name>Synthetic</name></model>';
    const model = dto.importMeffToModelDto(xml);
    assert.equal(model.id, 'synthetic-model');
    assert.equal(dto.parseModelDto(dto.serializeModelDto(model)).id, model.id);
    assert.equal(typeof dto.validateModelDto, 'function');
    assert.equal(dto.importMeffToModelDto(dto.exportModelDtoToMeff(model)).id, model.id);

    const layout = await import('archimate-js/layout');
    const synthetic = { schemaVersion: 1, id: 'synthetic', elements: [], relationships: [],
      diagnostics: [], views: [{ id: 'view', nodes: [
        { id: 'one', kind: 'container', x: 10, y: 10, width: 40, height: 30, nodes: [] },
        { id: 'two', kind: 'container', x: 15, y: 15, width: 40, height: 30, nodes: [] }
      ], connections: [] }] };
    const laidOut = await layout.layoutView(synthetic, 'view', { strategy: 'builtin' });
    const outline = dto.createAccessibleOutline(synthetic, 'view');
    assert.equal(outline.viewId, 'view');
    assert.deepEqual(outline.nodes.map((node) => node.id), ['one', 'two']);
    assert.match(dto.formatAccessibleOutline(outline), /view/);
    assert.equal(laidOut.status, 'ok');
    assert.equal(laidOut.metrics.overlapCountBefore, 1);
    assert.equal(laidOut.metrics.overlapCountAfter, 0);
    assert.equal(synthetic.views[0].nodes[1].x, 15);

    await assert.rejects(
      import('archimate-js/lib/Viewer'),
      (error) => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    );
  `;
  run(process.execPath, ['--input-type=module', '-e', consumerScript], { cwd: consumer });

  const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
    bin: Record<string, string>;
    exports: Record<string, { import?: string } | string>;
  };
  const exportEntry = (name: string): { import?: string } => {
    const entry = packageJson.exports[name];
    if (typeof entry !== 'object') throw new TypeError(`${name} must be a conditional export`);
    return entry;
  };
  const consumerRequire = createRequire(path.join(consumer, 'package.json'));
  assert.equal(exportEntry('./validator').import, './dist/validator/index.js');
  assert.equal(exportEntry('./model-dto').import, './dist/model-dto/index.js');
  assert.equal(exportEntry('./layout').import, './dist/layout/index.js');
  assert.equal(exportEntry('./export').import, './dist/export/index.mjs');
  assert.equal(packageJson.exports['./app-shell.css'], './assets/design-tokens/app-shell.css');
  assert.deepEqual(Object.keys(packageJson.exports).sort(),
    ['.', './app-shell.css', './export', './layout', './model-dto', './validator']);
  const stylePath = consumerRequire.resolve('archimate-js/app-shell.css');
  assert.match(await readFile(stylePath, 'utf8'), /\.am-app \.am-ui-status/);
  await readFile(path.join(packageRoot, 'assets/design-tokens/app.generated.css'), 'utf8');
  await readFile(path.join(packageRoot, 'assets/ibm-plex-font/IBMPlexSans-Regular.ttf'));
  assert.equal(packageJson.bin['archimate-js'], 'dist/cli/main.mjs');
  await readFile(path.join(packageRoot, 'dist/browser/archimate-js.js'), 'utf8');
  const installedBin = process.platform === 'win32'
    ? path.join(consumer, 'node_modules/.bin/archimate-js.cmd')
    : path.join(consumer, 'node_modules/.bin/archimate-js');
  const packedCli = run(installedBin, [
    'validate', path.join(root, 'test/fixtures/synthetic/minimal-application-view.xml')
  ], { cwd: consumer });
  assert.equal(JSON.parse(packedCli).valid, true);
  assert.ok(consumerRequire.resolve('playwright-core'));
  assert.ok(consumerRequire.resolve('archimate-font/package.json'));
  await assert.rejects(readFile(path.join(
    consumer,
    'node_modules/archimate-font/lib/css/archimate-font-ie7.css'
  ), 'utf8'));
  await assert.rejects(readFile(path.join(
    consumer,
    'node_modules/archimate-font/lib/demo.html'
  ), 'utf8'));
  console.log('packed package consumer smoke test passed');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown packed consumer failure.';
  throw new Error(`Packed package consumer smoke test failed: ${message}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
