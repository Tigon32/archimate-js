import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyReleaseEvidence } from '../../scripts/create-release-evidence.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-evidence-test-'));
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
try {
  const tarball = Buffer.from('synthetic package archive');
  const sbom = Buffer.from(JSON.stringify({ spdxVersion: 'SPDX-2.3', packages: [
    { name: 'archimate-js', versionInfo: '0.0.4' }
  ] }));
  const manifest = Buffer.from(JSON.stringify({
    schemaVersion: 1, package: { name: 'archimate-js', version: '0.0.4' },
    sourceSha: 'a'.repeat(40), checks: {
      releaseCheck: 'passed', packedInstall: 'passed', sbom: 'passed'
    }, artifacts: {
      tarball: { name: 'archimate-js-0.0.4.tgz', sha256: hash(tarball) },
      sbom: { name: 'sbom.spdx.json', sha256: hash(sbom) }
    }
  }));
  await writeFile(path.join(directory, 'archimate-js-0.0.4.tgz'), tarball);
  await writeFile(path.join(directory, 'sbom.spdx.json'), sbom);
  await writeFile(path.join(directory, 'manifest.json'), manifest);
  await writeFile(path.join(directory, 'SHA256SUMS'), [
    `${hash(tarball)}  archimate-js-0.0.4.tgz`,
    `${hash(sbom)}  sbom.spdx.json`,
    `${hash(manifest)}  manifest.json`
  ].join('\n') + '\n');

  assert.equal((await verifyReleaseEvidence(directory)).package.version, '0.0.4');
  await writeFile(path.join(directory, 'archimate-js-0.0.4.tgz'), 'tampered');
  await assert.rejects(verifyReleaseEvidence(directory), /Checksum mismatch/);
  await writeFile(path.join(directory, 'archimate-js-0.0.4.tgz'), tarball);
  const missingPackage = Buffer.from(JSON.stringify({ spdxVersion: 'SPDX-2.3', packages: [] }));
  await writeFile(path.join(directory, 'sbom.spdx.json'), missingPackage);
  const sums = (await readFile(path.join(directory, 'SHA256SUMS'), 'utf8'))
    .replace(hash(sbom), hash(missingPackage));
  await writeFile(path.join(directory, 'SHA256SUMS'), sums);
  await assert.rejects(verifyReleaseEvidence(directory), /SBOM must describe/);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Release evidence integrity test passed.');
