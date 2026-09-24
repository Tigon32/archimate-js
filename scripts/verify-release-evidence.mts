import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyReleaseEvidence } from './create-release-evidence.mjs';

const repository = 'Tigon32/archimate-js';
const workflow = `${repository}/.github/workflows/release-gate.yml`;

export type ExpectedRelease = {
  tag: string;
  sourceSha: string;
  runId: string;
};

type VerifiedManifest = {
  package: { name: string; version: string };
  sourceSha: string;
  workflowRun: string | null;
  artifacts: { tarball: { name: string } };
};

export async function checkConsumerEvidence(directory: string, expected: ExpectedRelease): Promise<string> {
  assert.match(expected.tag, /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/);
  assert.match(expected.sourceSha, /^[0-9a-f]{40}$/);
  assert.match(expected.runId, /^[1-9][0-9]*$/);
  const manifest = await verifyReleaseEvidence(directory) as VerifiedManifest;
  assert.equal(expected.tag, `v${manifest.package.version}`, 'Tag does not match package version.');
  assert.equal(expected.sourceSha, manifest.sourceSha, 'Source SHA does not match manifest.');
  assert.equal(manifest.workflowRun,
    `https://github.com/${repository}/actions/runs/${expected.runId}`,
    'Workflow run does not match manifest.');
  const tarball = path.join(directory, manifest.artifacts.tarball.name);
  let packedPackage: { name?: unknown; version?: unknown };
  try {
    const metadata = execFileSync('tar', [ '-xOf', tarball, 'package/package.json' ],
      { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ], maxBuffer: 1024 * 1024 });
    packedPackage = JSON.parse(metadata) as { name?: unknown; version?: unknown };
  } catch {
    throw new Error('Cannot read package metadata from release tarball.');
  }
  assert.equal(packedPackage.name, manifest.package.name, 'Tarball package name does not match manifest.');
  assert.equal(packedPackage.version, manifest.package.version,
    'Tarball package version does not match manifest.');
  return tarball;
}

export function attestationArgs(tarball: string, expected: ExpectedRelease): string[] {
  return [ 'attestation', 'verify', tarball, '--repo', repository,
    '--signer-workflow', workflow, '--source-ref', `refs/tags/${expected.tag}`,
    '--source-digest', expected.sourceSha ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [ directory, tag, sourceSha, runId ] = process.argv.slice(2);
  assert.ok(directory && tag && sourceSha && runId && process.argv.length === 6,
    'Usage: node scripts/verify-release-evidence.mts <evidence-dir> <tag> <source-sha> <run-id>');
  const expected = { tag, sourceSha, runId };
  const tarball = await checkConsumerEvidence(directory, expected);
  try {
    execFileSync('gh', attestationArgs(tarball, expected), { stdio: [ 'ignore', 'pipe', 'pipe' ] });
  } catch {
    throw new Error('GitHub artifact attestation verification failed.');
  }
  console.log('Release evidence and tarball attestation verified.');
}
