import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

test('requires fixture and research inventories for tracked artifacts', () => {
  const researchInventory = new Set([
    'docs/research/README.md', 'docs/research/sources.yaml', 'docs/research/okf/index.md',
    'docs/research/okf/synthetic-reference.md'
  ]);
  assert.deepEqual(scanTrackedPaths([
    'test/fixtures/synthetic/unlisted.txt', 'docs/research/unlisted-note.md',
    'docs/research/okf/synthetic-reference.md', 'models/unlisted.xml'
  ], manifest, [], new Set(), researchInventory), [
    { rule: 'unmanifested-fixture' }, { rule: 'unmanifested-research-artifact' },
    { rule: 'unmanifested-model-or-media' }
  ]);
});

test('an exact path and finding exception changes only that finding to reviewed', () => {
  const exception = {
    path: 'models/synthetic-public-example.pdf', finding: 'unmanifested-model-or-media' as const,
    rationale: 'SYNTHETIC reviewed test record.', expiresOn: '2099-01-01',
    approver: 'synthetic-reviewer', reviewedOn: '2026-09-25'
  };
  const paths = ['models/synthetic-public-example.pdf', 'models/other-example.pdf'];
  assert.deepEqual(scanTrackedPaths(paths, manifest, [exception]), [
    { rule: 'unmanifested-model-or-media', outcome: 'reviewed' },
    { rule: 'unmanifested-model-or-media' }
  ]);
  assert.equal(formatFindings(scanTrackedPaths(paths, manifest, [exception])).includes(exception.path), false);
});

test('exceptions cannot authorize forbidden paths, fixture omissions, wrong classes, or symlinks', () => {
  const exception = {
    path: 'customer-exports/synthetic.xml', finding: 'unmanifested-model-or-media' as const,
    rationale: 'SYNTHETIC reviewed test record.', expiresOn: '2099-01-01',
    approver: 'synthetic-reviewer', reviewedOn: '2026-09-25'
  };
  assert.deepEqual(scanTrackedPaths([exception.path], manifest, [exception]), [
    { rule: 'forbidden-tracked-path' }, { rule: 'unmanifested-model-or-media' }
  ]);
  const wrongClass = { ...exception, path: 'models/synthetic.xml', finding: 'unmanifested-research-artifact' as const };
  assert.deepEqual(scanTrackedPaths([wrongClass.path], manifest, [wrongClass]), [
    { rule: 'unmanifested-model-or-media' }
  ]);
  const safeException = { ...exception, path: 'models/synthetic.xml' };
  assert.deepEqual(scanTrackedPaths([safeException.path], manifest, [safeException], new Set([safeException.path])), [
    { rule: 'symlink-not-allowed' }, { rule: 'unmanifested-model-or-media' }
  ]);
  assert.deepEqual(scanTrackedPaths(['test/fixtures/synthetic/unlisted.xml'], manifest,
    [{ ...safeException, path: 'test/fixtures/synthetic/unlisted.xml' }]), [
    { rule: 'unmanifested-fixture' }
  ]);
});

test('uses NUL-separated tracked paths and scans only tracked files', () => {
  const root = mkdtempSync(join(process.cwd(), '.synthetic-path-scan-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'test/fixtures/synthetic'), { recursive: true });
    mkdirSync(join(root, 'docs/research/okf'), { recursive: true });
    mkdirSync(join(root, 'docs/security'), { recursive: true });
    writeFileSync(join(root, 'test/fixtures/manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'test/fixtures/synthetic/example.xml'), '<model/>');
    writeFileSync(join(root, 'docs/research/README.md'), '# Research index\n');
    writeFileSync(join(root, 'docs/research/sources.yaml'), 'sources: []\n');
    writeFileSync(join(root, 'docs/research/okf/index.md'), '# OKF index\n');
    writeFileSync(join(root, 'docs/security/public-source-exceptions.json'), JSON.stringify({ schemaVersion: 1, exceptions: [] }));
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

test('loads only valid exact exceptions and rejects stale or expired entries without leaking metadata', () => {
  const root = mkdtempSync(join(process.cwd(), '.synthetic-exception-scan-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'test/fixtures'), { recursive: true });
    mkdirSync(join(root, 'docs/research/okf'), { recursive: true });
    mkdirSync(join(root, 'docs/security'), { recursive: true });
    mkdirSync(join(root, 'media'), { recursive: true });
    writeFileSync(join(root, 'test/fixtures/manifest.json'), '[]');
    writeFileSync(join(root, 'docs/research/README.md'), '# Research index\n');
    writeFileSync(join(root, 'docs/research/sources.yaml'), 'sources: []\n');
    writeFileSync(join(root, 'docs/research/okf/index.md'), '# OKF index\n');
    writeFileSync(join(root, 'media/synthetic-public.pdf'), 'SYNTHETIC');
    const exception = {
      path: 'media/synthetic-public.pdf', finding: 'unmanifested-model-or-media',
      rationale: 'SYNTHETIC_PRIVATE_SENTINEL_DO_NOT_ECHO', expiresOn: '2099-01-01',
      approver: 'synthetic-reviewer', reviewedOn: '2026-09-25'
    };
    writeFileSync(join(root, 'docs/security/public-source-exceptions.json'), JSON.stringify({ schemaVersion: 1, exceptions: [exception] }));
    execFileSync('git', ['add', '--', 'test/fixtures', 'docs/research', 'media/synthetic-public.pdf'], { cwd: root });
    assert.deepEqual(checkTrackedPaths(root, '2026-09-25'), [
      { rule: 'unmanifested-model-or-media', outcome: 'reviewed' }
    ]);

    const wrongPath = { ...exception, path: 'media/other.pdf' };
    writeFileSync(join(root, 'docs/security/public-source-exceptions.json'), JSON.stringify({ schemaVersion: 1, exceptions: [wrongPath] }));
    assert.deepEqual(checkTrackedPaths(root, '2026-09-25'), [
      { rule: 'unmanifested-model-or-media' }, { rule: 'stale-public-source-exception' }
    ]);
    assert.ok(!formatFindings(checkTrackedPaths(root, '2026-09-25')).includes(wrongPath.path));

    writeFileSync(join(root, 'docs/security/public-source-exceptions.json'), JSON.stringify({
      schemaVersion: 1, exceptions: [{ ...exception, expiresOn: '2026-09-24' }]
    }));
    assert.deepEqual(checkTrackedPaths(root, '2026-09-25'), [
      { rule: 'public-source-exception-policy-invalid' }
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a symlinked artifact remains blocked even when its exact path has an exception', () => {
  const root = mkdtempSync(join(process.cwd(), '.synthetic-symlink-scan-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'test/fixtures'), { recursive: true });
    mkdirSync(join(root, 'docs/research/okf'), { recursive: true });
    mkdirSync(join(root, 'docs/security'), { recursive: true });
    mkdirSync(join(root, 'media'), { recursive: true });
    writeFileSync(join(root, 'test/fixtures/manifest.json'), '[]');
    writeFileSync(join(root, 'docs/research/README.md'), '# Research index\n');
    writeFileSync(join(root, 'docs/research/sources.yaml'), 'sources: []\n');
    writeFileSync(join(root, 'docs/research/okf/index.md'), '# OKF index\n');
    writeFileSync(join(root, 'outside.txt'), 'SYNTHETIC');
    symlinkSync('../outside.txt', join(root, 'media/synthetic.xml'));
    writeFileSync(join(root, 'docs/security/public-source-exceptions.json'), JSON.stringify({
      schemaVersion: 1,
      exceptions: [{ path: 'media/synthetic.xml', finding: 'unmanifested-model-or-media',
        rationale: 'SYNTHETIC test.', expiresOn: '2099-01-01', approver: 'synthetic-reviewer', reviewedOn: '2026-09-25' }]
    }));
    execFileSync('git', ['add', '--', 'test/fixtures', 'docs/research', 'docs/security', 'media/synthetic.xml', 'outside.txt'], { cwd: root });
    assert.deepEqual(checkTrackedPaths(root, '2026-09-25'), [
      { rule: 'symlink-not-allowed' }, { rule: 'unmanifested-model-or-media' },
      { rule: 'stale-public-source-exception' }
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
