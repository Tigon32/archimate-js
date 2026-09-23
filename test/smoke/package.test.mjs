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
assert.ok(packageJson.files.includes('index.js'), 'package publishes index.js');\nassert.ok(packageJson.files.includes('THIRD_PARTY_NOTICES.md'), 'package publishes third-party notices');\nassert.ok(packageJson.files.includes('assets'), 'package publishes licensed assets');
assert.ok(packageJson.files.includes('lib'), 'package publishes lib/');
assert.equal(packageJson.exports['./validator'].import, './dist/validator/index.js');
assert.ok(packageJson.scripts['test:unit'].includes('--coverage.enabled'), 'unit tests publish informational coverage');

console.log('package smoke test passed');
