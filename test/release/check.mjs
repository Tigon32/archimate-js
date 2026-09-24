import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
const exportsDoc = await readFile(path.join(root, 'docs/releases.md'), 'utf8');
const version = packageJson.version;

assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
  'package version must follow SemVer');
assert.ok(changelog.split(/\r?\n/).some((line) => line === `## ${version}` || line === `## [${version}]`),
  'CHANGELOG.md must contain a section for the package version');
assert.deepEqual(Object.keys(packageJson.exports).sort(), ['.', './app-shell.css', './layout', './model-dto', './validator'],
  'package exports must match the documented stable import paths');
assert.match(exportsDoc, /archimate-js\/validator/);
assert.match(exportsDoc, /archimate-js\/model-dto/);
assert.match(exportsDoc, /archimate-js\/layout/);
assert.match(exportsDoc, /archimate-js\/app-shell\.css/);

const ref = process.env.GITHUB_REF || '';
if (ref.startsWith('refs/tags/')) {
  assert.equal(ref.slice('refs/tags/'.length), `v${version}`,
    'release tag must be v followed by package.json version');
}

const major = Number(version.split(/[.+-]/, 1)[0]);
const prerelease = version.includes('-');
if (!prerelease && major >= 1) {
  const evidence = await readFile(path.join(root, 'docs/releases/operational-evidence.md'), 'utf8');
  assert.match(evidence, /^Status: READY$/m,
    'stable releases require reviewed importer/exporter/render interoperability evidence');
  assert.doesNotMatch(evidence, /\|\s*(?:Not demonstrated|Partial)(?:\s|;|\|)/i,
    'stable releases cannot pass with incomplete evidence rows');
}

const checks = [
  ['lint', ['run', 'lint']],
  ['tests (package, security, unit, SVG contracts)', ['test']],
  ['compile', ['run', 'compile']],
  ['browser and synthetic render smoke', ['run', 'test:browser']]
];

for (const [label, args] of checks) {
  console.log(`Release gate: ${label}`);
  const result = spawnSync('npm', args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Release gate stopped at ${label}.`);
  }
}

console.log(`Release checks passed for ${version}. This does not assert operational interoperability readiness.`);
