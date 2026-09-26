import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8')
) as {
  name: string;
  license: string;
  dependencies: Record<string, string>;
  files: string[];
  bin: Record<string, string>;
  exports: Record<string, { import?: string; types?: string } | string>;
  scripts: Record<string, string>;
};

function exportEntry(name: string): { import?: string; types?: string } {
  const entry = packageJson.exports[name];
  if (typeof entry !== 'object') throw new TypeError(`${name} must be a conditional export`);
  return entry;
}

assert.equal(packageJson.name, 'archimate-js');
assert.equal(packageJson.license, 'MIT');
assert.ok(packageJson.dependencies['diagram-js'], 'diagram-js dependency is declared');
assert.equal(
  packageJson.dependencies['object-refs'],
  undefined,
  'object-refs remains owned by diagram-js instead of being upgraded independently'
);
assert.ok(packageJson.dependencies['moddle-xml'], 'moddle-xml dependency is declared');
assert.equal(packageJson.dependencies.elkjs, '0.12.0', 'ELK version is pinned exactly');
assert.ok(packageJson.dependencies.saxes, 'bounded XML parser dependency is declared');
assert.ok(packageJson.files.includes('index.js'), 'package publishes index.js');
assert.ok(packageJson.files.includes('THIRD_PARTY_NOTICES.md'), 'package publishes third-party notices');
assert.ok(packageJson.files.includes('licenses'), 'package publishes selected EPL license text');
assert.ok(packageJson.files.includes('assets'), 'package publishes licensed assets');
assert.ok(packageJson.files.includes('lib'), 'package publishes lib/');
assert.ok(packageJson.files.includes('archimate-font/package.json'), 'package publishes its local font package metadata');
assert.ok(packageJson.files.includes('archimate-font/LICENSE'), 'package publishes the local font OFL license');
assert.ok(packageJson.files.includes('archimate-font/lib/css/archimate-font.css'), 'package publishes only the runtime font CSS');
assert.ok(!packageJson.files.includes('archimate-font/lib/css'), 'package does not publish the full legacy font CSS directory');
assert.ok(packageJson.files.includes('dist'), 'package publishes compiled distributions');
assert.equal(packageJson.bin['archimate-js'], 'dist/cli/main.mjs');
assert.ok(packageJson.dependencies['playwright-core'], 'headless CLI runtime is declared');
assert.equal(exportEntry('./validator').import, './dist/validator/index.js');
assert.equal(exportEntry('./model-dto').import, './dist/model-dto/index.js');
assert.equal(exportEntry('./model-dto').types, './dist/model-dto/index.d.ts');
assert.equal(exportEntry('./modeler').import, './dist/modeler/index.js');
assert.equal(exportEntry('./modeler').types, './dist/modeler/index.d.ts');
assert.equal(exportEntry('./layout').import, './dist/layout/index.js');
assert.equal(exportEntry('./layout').types, './dist/layout/index.d.ts');
assert.equal(exportEntry('./lint').import, './dist/lint/index.mjs');
assert.equal(exportEntry('./lint').types, './dist/lint/index.d.mts');
assert.equal(exportEntry('./extensions').import, './dist/extensions/index.mjs');
assert.equal(exportEntry('./extensions').types, './dist/extensions/index.d.mts');
assert.equal(packageJson.exports['./app-shell.css'], './assets/design-tokens/app-shell.css');
assert.ok(packageJson.scripts['compile:browser'].includes('compile:model-dto'),
  'browser bundle builds the shared relationship service');
assert.ok(packageJson.scripts['compile:browser'].includes('generate:relationship-semantics-adapter'),
  'browser bundle generates the typed legacy service bridge');
assert.ok(packageJson.scripts['test:unit:run'].includes('--coverage.enabled'),
  'unit tests publish informational coverage');

console.log('package smoke test passed');
