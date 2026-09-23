import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8')
);

assert.equal(packageJson.name, 'archimate-js');
assert.equal(packageJson.license, 'MIT');
assert.ok(packageJson.dependencies['diagram-js'], 'diagram-js dependency is declared');
assert.ok(packageJson.dependencies['moddle-xml'], 'moddle-xml dependency is declared');
assert.ok(packageJson.files.includes('index.js'), 'package publishes index.js');
assert.ok(packageJson.files.includes('lib'), 'package publishes lib/');

console.log('package smoke test passed');
