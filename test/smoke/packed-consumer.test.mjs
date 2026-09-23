import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await mkdtemp(path.join(root, '.release-consumer-'));
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
  const packOutput = run('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', temp
  ], { cwd: root });
  const [packed] = JSON.parse(packOutput);
  const archive = path.join(temp, packed.filename);
  execFileSync('tar', ['-xzf', archive, '-C', temp]);

  const packageRoot = path.join(temp, 'package');
  const consumer = path.join(temp, 'consumer');
  await mkdir(path.join(consumer, 'node_modules'), { recursive: true });
  await symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
  await symlink(packageRoot, path.join(consumer, 'node_modules', 'archimate-js'), 'dir');

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
    resolve: { modules: [ path.join(consumer, 'node_modules'), path.join(root, 'node_modules') ] }
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
  console.log('packed package consumer smoke test passed');
} catch (error) {
  throw new Error(`Packed package consumer smoke test failed: ${error.message}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
