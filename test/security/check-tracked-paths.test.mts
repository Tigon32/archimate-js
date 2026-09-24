import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { checkTrackedPaths, formatFindings, readTrackedPaths, scanTrackedPaths } from '../../scripts/check-tracked-paths.mts';

const manifest = [{ path: 'test/fixtures/synthetic/example.xml', classification: 'SYNTHETIC' }];

test('allows inventoried synthetic models, source, and existing font assets', () => {
  assert.deepEqual(scanTrackedPaths([
    'test/fixtures/synthetic/example.xml', 'docs/standards/README.md',
    'src/export/index.mts', 'archimate-font/lib/font/archimate-font.woff2'
  ], manifest), []);
});

test('rejects forbidden directories and unmanifested model or media without exposing names', () => {
  const privateName = 'customer-private-name';
  const findings = scanTrackedPaths([
    `private/${privateName}.txt`, `docs/${privateName}-prompt-log.md`,
    'models/unlisted.xml', 'screenshots/architecture.png'
  ], manifest);
  assert.deepEqual(findings.map(({ rule }) => rule), [
    'forbidden-tracked-path', 'forbidden-tracked-path',
    'unmanifested-model-or-media', 'unmanifested-model-or-media'
  ]);
  assert.equal(formatFindings(findings), 'forbidden-tracked-path: 2\nunmanifested-model-or-media: 2');
  assert.ok(!formatFindings(findings).includes(privateName));
});

test('uses NUL-separated tracked paths and scans only tracked files', () => {
  const root = mkdtempSync(join(process.cwd(), '.synthetic-path-scan-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'test/fixtures/synthetic'), { recursive: true });
    writeFileSync(join(root, 'test/fixtures/manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'test/fixtures/synthetic/example.xml'), '<model/>');
    writeFileSync(join(root, 'line\nbreak.txt'), 'SYNTHETIC');
    writeFileSync(join(root, 'untracked.png'), 'SYNTHETIC');
    execFileSync('git', ['add', '--', 'test/fixtures', 'line\nbreak.txt'], { cwd: root });
    assert.ok(readTrackedPaths(root).includes('line\nbreak.txt'));
    assert.deepEqual(checkTrackedPaths(root), []);
    execFileSync('git', ['add', '--', 'untracked.png'], { cwd: root });
    assert.deepEqual(checkTrackedPaths(root), [{ rule: 'unmanifested-model-or-media' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
