// All canaries below are SYNTHETIC and assembled in memory for this public repository.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { scanSecretText, scanTrackedText } from '../../scripts/check-secrets.mts';

const githubCanary = ['ghp', '_', 'A'.repeat(24)].join('');
const awsCanary = ['AKIA', 'B'.repeat(16)].join('');
const keyCanary = ['-----BEGIN ', 'PRIVATE KEY', '-----'].join('');
const markerCanary = ['synthetic', '-', 'restricted', '-', 'marker'].join('');

assert.deepEqual(
  scanSecretText([githubCanary, awsCanary, keyCanary, markerCanary].join('\n'), [markerCanary]).map(value => value.rule),
  ['github-token', 'aws-access-key', 'private-key-header', 'configured-marker']
);
assert.deepEqual(scanSecretText('Public documentation with generic examples only.'), []);

const root = mkdtempSync(join(tmpdir(), 'archimate-secret-scan-'));
const outside = mkdtempSync(join(tmpdir(), 'archimate-secret-outside-'));
try {
  execFileSync('git', ['init', '-q', root], { stdio: 'ignore' });
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'canary.txt'), githubCanary);
  writeFileSync(join(root, 'docs', 'binary.bin'), Buffer.from([0, 1, 2]));
  symlinkSync(join(root, 'docs', 'canary.txt'), join(root, 'docs', 'link.txt'));
  execFileSync('git', ['add', 'docs'], { cwd: root, stdio: 'ignore' });
  const result = scanTrackedText(root);
  assert.deepEqual(result.findings.map(value => value.rule), ['github-token', 'symlink-tracked-entry']);
  assert.equal(result.scanned, 1);
  assert.equal(result.skippedBinary, 1);

  const script = new URL('../../scripts/check-secrets.mts', import.meta.url);
  const cli = spawnSync(process.execPath, [script.pathname], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ARCHIMATE_SECRET_SCAN_MARKERS: '' }
  });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /github-token: 1/);
  assert.doesNotMatch(cli.stdout + cli.stderr, new RegExp(githubCanary));
  assert.doesNotMatch(cli.stdout + cli.stderr, /canary\.txt|link\.txt/);

  writeFileSync(join(root, 'docs', 'canary.txt'), markerCanary);
  const markerCli = spawnSync(process.execPath, [script.pathname], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ARCHIMATE_SECRET_SCAN_MARKERS: markerCanary }
  });
  assert.equal(markerCli.status, 1);
  assert.match(markerCli.stderr, /configured-marker: 1/);
  assert.doesNotMatch(markerCli.stdout + markerCli.stderr, new RegExp(markerCanary));

  renameSync(join(root, 'docs'), join(root, 'stored-docs'));
  writeFileSync(join(outside, 'canary.txt'), githubCanary);
  symlinkSync(outside, join(root, 'docs'));
  const escaped = scanTrackedText(root);
  assert.deepEqual(escaped.findings.map(value => value.rule), [
    'symlink-tracked-entry', 'symlink-tracked-entry', 'symlink-tracked-entry'
  ]);
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}

console.log('Synthetic secret-scan checks passed.');
