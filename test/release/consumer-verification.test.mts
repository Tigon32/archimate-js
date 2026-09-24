import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { attestationArgs, checkConsumerEvidence } from '../../scripts/verify-release-evidence.mts';

// SYNTHETIC provenance: these bytes and metadata are created solely by this test.
const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-consumer-verification-'));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const expected = { tag: 'v0.0.4', sourceSha: 'a'.repeat(40), runId: '12345' };
const tarballName = 'archimate-js-0.0.4.tgz';
try {
  const packageDir = path.join(directory, 'staging', 'package');
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'),
    JSON.stringify({ name: 'archimate-js', version: '0.0.4' }));
  execFileSync('tar', [ '-czf', path.join(directory, tarballName), '-C',
    path.join(directory, 'staging'), 'package/package.json' ]);
  const tarball = await readFile(path.join(directory, tarballName));
  const sbom = Buffer.from(JSON.stringify({ spdxVersion: 'SPDX-2.3', packages: [
    { name: 'archimate-js', versionInfo: '0.0.4' }
  ] }));
  const manifest = Buffer.from(JSON.stringify({
    schemaVersion: 1, package: { name: 'archimate-js', version: '0.0.4' },
    sourceSha: expected.sourceSha,
    workflowRun: `https://github.com/Tigon32/archimate-js/actions/runs/${expected.runId}`,
    checks: { releaseCheck: 'passed', packedInstall: 'passed', sbom: 'passed' },
    artifacts: {
      tarball: { name: tarballName, sha256: hash(tarball) },
      sbom: { name: 'sbom.spdx.json', sha256: hash(sbom) }
    }
  }));
  await writeFile(path.join(directory, tarballName), tarball);
  await writeFile(path.join(directory, 'sbom.spdx.json'), sbom);
  await writeFile(path.join(directory, 'manifest.json'), manifest);
  await writeFile(path.join(directory, 'SHA256SUMS'), [
    `${hash(tarball)}  ${tarballName}`,
    `${hash(sbom)}  sbom.spdx.json`,
    `${hash(manifest)}  manifest.json`
  ].join('\n') + '\n');

  assert.equal(await checkConsumerEvidence(directory, expected), path.join(directory, tarballName));
  await assert.rejects(checkConsumerEvidence(directory, { ...expected, tag: 'v0.0.5' }),
    /Tag does not match/);
  await assert.rejects(checkConsumerEvidence(directory, { ...expected, sourceSha: 'b'.repeat(40) }),
    /Source SHA does not match/);
  await assert.rejects(checkConsumerEvidence(directory, { ...expected, runId: '12346' }),
    /Workflow run does not match/);
  assert.deepEqual(attestationArgs(path.join(directory, tarballName), expected), [
    'attestation', 'verify', path.join(directory, tarballName), '--repo', 'Tigon32/archimate-js',
    '--signer-workflow', 'Tigon32/archimate-js/.github/workflows/release-gate.yml',
    '--source-ref', 'refs/tags/v0.0.4', '--source-digest', expected.sourceSha
  ]);
  await writeFile(path.join(directory, tarballName), 'tampered');
  await assert.rejects(checkConsumerEvidence(directory, expected), /Checksum mismatch/);
  await writeFile(path.join(packageDir, 'package.json'),
    JSON.stringify({ name: 'wrong-synthetic-package', version: '0.0.4' }));
  execFileSync('tar', [ '-czf', path.join(directory, tarballName), '-C',
    path.join(directory, 'staging'), 'package/package.json' ]);
  const wrongTarball = await readFile(path.join(directory, tarballName));
  const wrongManifest = Buffer.from(manifest.toString().replace(hash(tarball), hash(wrongTarball)));
  await writeFile(path.join(directory, 'manifest.json'), wrongManifest);
  await writeFile(path.join(directory, 'SHA256SUMS'), [
    `${hash(wrongTarball)}  ${tarballName}`,
    `${hash(sbom)}  sbom.spdx.json`,
    `${hash(wrongManifest)}  manifest.json`
  ].join('\n') + '\n');
  await assert.rejects(checkConsumerEvidence(directory, expected), /Tarball package name does not match/);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('SYNTHETIC release consumer verification test passed.');
