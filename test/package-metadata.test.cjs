const assert = require('assert');
const { readFileSync } = require('fs');
const { join } = require('path');

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
);

assert.strictEqual(packageJson.name, 'archimate-js');
assert.strictEqual(packageJson.license, 'MIT');
assert.ok(packageJson.scripts.lint, 'lint script must exist');
assert.ok(packageJson.scripts.test, 'test script must exist');
assert.ok(packageJson.files.includes('lib'), 'package must include lib/');
assert.ok(packageJson.files.includes('index.js'), 'package must include index.js');

console.log('package metadata smoke test passed');
