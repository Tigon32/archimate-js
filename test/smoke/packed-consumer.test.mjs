import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-release-consumer-'));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.error?.message || '').trim().split('\n').slice(-8).join('\n');
    throw new Error(`Packed consumer check failed (${command} ${args[0]}): ${detail}`);
  }
  return result.stdout;
};

try {
  run(process.execPath, ['test/smoke/compile-validator.mjs'], { cwd: root });
  run(process.execPath, ['test/smoke/compile.mjs'], { cwd: root });
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

  const packageRoot = path.join(consumer, 'node_modules', 'archimate-js');

  const consumerEntry = path.join(consumer, 'consumer-entry.mjs');
  await writeFile(consumerEntry, `
    import Viewer, { mountViewer, renderViewToSvg } from 'archimate-js';
    export default {
      viewer: typeof Viewer,
      mountViewer: typeof mountViewer,
      renderViewToSvg: typeof renderViewToSvg
    };
  `);
  const require = createRequire(path.join(root, 'package.json'));
  const webpack = require('webpack');
  const bundlePath = path.join(consumer, 'consumer.cjs');
  await new Promise((resolve, reject) => webpack({
    mode: 'production',
    target: 'node',
    entry: consumerEntry,
    output: { path: consumer, filename: path.basename(bundlePath), library: { type: 'commonjs2' } },
    resolve: { modules: [ path.join(consumer, 'node_modules') ] }
  }, (error, stats) => {
    if (error || stats.hasErrors()) {
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
  assert.deepEqual(rootApi, { viewer: 'function', mountViewer: 'function', renderViewToSvg: 'function' });

  const consumerScript = String.raw`
    import assert from 'node:assert/strict';
    const validator = await import('archimate-js/validator');
    assert.equal(validator.ARCHIMATE_LANGUAGE_VERSION, '3.2');
    assert.equal(typeof validator.validateArchimateXml, 'function');
    const result = validator.validateArchimateXml(
      '<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" id="synthetic-model"><name>Synthetic</name></model>'
    );
    assert.equal(result.valid, true);

    await assert.rejects(
      import('archimate-js/lib/Viewer'),
      (error) => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    );
  `;
  run(process.execPath, ['--input-type=module', '-e', consumerScript], { cwd: consumer });

  const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.exports['./validator'].import, './dist/validator/index.js');
  assert.deepEqual(Object.keys(packageJson.exports).sort(), ['.', './validator']);
  assert.equal(packageJson.bin['archimate-js'], 'bin/archimate-js.mjs');
  await readFile(path.join(packageRoot, 'dist/browser/archimate-js.js'), 'utf8');
  const installedBin = process.platform === 'win32'
    ? path.join(consumer, 'node_modules/.bin/archimate-js.cmd')
    : path.join(consumer, 'node_modules/.bin/archimate-js');
  const packedCli = run(installedBin, [
    'validate', path.join(root, 'test/fixtures/synthetic/minimal-application-view.xml')
  ], { cwd: consumer });
  assert.equal(JSON.parse(packedCli).valid, true);
  const consumerRequire = createRequire(path.join(consumer, 'package.json'));
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
  throw new Error(`Packed package consumer smoke test failed: ${error.message}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
