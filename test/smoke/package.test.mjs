import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8')
);

assert.equal(packageJson.name, 'archimate-js');
assert.equal(packageJson.license, 'MIT');
assert.ok(packageJson.dependencies['diagram-js'], 'diagram-js dependency is declared');
assert.ok(packageJson.dependencies['moddle-xml'], 'moddle-xml dependency is declared');
assert.ok(packageJson.dependencies.saxes, 'bounded XML parser dependency is declared');
assert.ok(packageJson.files.includes('index.js'), 'package publishes index.js');
assert.ok(packageJson.files.includes('THIRD_PARTY_NOTICES.md'), 'package publishes third-party notices');
assert.ok(packageJson.files.includes('assets'), 'package publishes licensed assets');
assert.ok(packageJson.files.includes('lib'), 'package publishes lib/');
assert.ok(packageJson.files.includes('archimate-font/package.json'), 'package publishes its local font package metadata');
assert.ok(packageJson.files.includes('archimate-font/LICENSE'), 'package publishes the local font OFL license');
assert.ok(packageJson.files.includes('archimate-font/lib/css/archimate-font.css'), 'package publishes only the runtime font CSS');
assert.ok(!packageJson.files.includes('archimate-font/lib/css'), 'package does not publish the full legacy font CSS directory');
assert.ok(packageJson.files.includes('bin'), 'package publishes bin/');
assert.equal(packageJson.bin['archimate-js'], 'bin/archimate-js.mjs');
assert.ok(packageJson.dependencies['playwright-core'], 'headless CLI runtime is declared');
assert.equal(packageJson.exports['./validator'].import, './dist/validator/index.js');
assert.ok(packageJson.scripts['test:unit'].includes('--coverage.enabled'), 'unit tests publish informational coverage');

console.log('package smoke test passed');
