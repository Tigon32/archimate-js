import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function command(label, executable, args, cwd) {
  try {
    return execFileSync(executable, args, { cwd, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ] });
  } catch {
    throw new Error(`Release evidence stopped at ${label}.`);
  }
}

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function verifyReleaseEvidence(directory) {
  const sums = await readFile(path.join(directory, 'SHA256SUMS'), 'utf8');
  const entries = sums.trimEnd().split('\n').map((line) => {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    assert.ok(match, 'Invalid release checksum entry.');
    return { hash: match[1], name: match[2] };
  });
  assert.equal(new Set(entries.map((entry) => entry.name)).size, 3);
  assert.equal(entries.filter((entry) => entry.name.endsWith('.tgz')).length, 1);
  assert.deepEqual(entries.map((entry) => entry.name).sort(),
    [ 'manifest.json', 'sbom.spdx.json', entries.find((entry) => entry.name.endsWith('.tgz'))?.name ].sort());
  for (const entry of entries) {
    assert.equal(digest(await readFile(path.join(directory, entry.name))), entry.hash,
      `Checksum mismatch for ${entry.name}.`);
  }
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const sbom = JSON.parse(await readFile(path.join(directory, 'sbom.spdx.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.sourceSha, /^[0-9a-f]{40}$/);
  assert.equal(manifest.checks.releaseCheck, 'passed');
  assert.equal(manifest.checks.packedInstall, 'passed');
  assert.equal(manifest.checks.sbom, 'passed');
  assert.match(sbom.spdxVersion, /^SPDX-/);
  assert.ok(sbom.packages?.some((item) => item.name === manifest.package.name &&
    item.versionInfo === manifest.package.version), 'SBOM must describe the packed package.');
  const tarball = entries.find((entry) => entry.name.endsWith('.tgz'));
  assert.equal(manifest.artifacts.tarball.name, tarball.name);
  assert.equal(manifest.artifacts.tarball.sha256, tarball.hash);
  assert.equal(manifest.artifacts.sbom.sha256,
    entries.find((entry) => entry.name === 'sbom.spdx.json').hash);
  return manifest;
}

export async function createReleaseEvidence(directory) {
  assert.equal(process.env.RELEASE_CHECK_PASSED, '1', 'Run release:check before creating release evidence.');
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const sourceSha = process.env.GITHUB_SHA || command('source revision', 'git', [ 'rev-parse', 'HEAD' ], root).trim();
  assert.match(sourceSha, /^[0-9a-f]{40}$/);
  const runId = process.env.GITHUB_RUN_ID || null;
  if (runId !== null) assert.match(runId, /^[1-9][0-9]*$/);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-release-evidence-'));
  let ownsDestination = false;
  try {
    await mkdir(directory);
    ownsDestination = true;
    const packed = JSON.parse(command('npm pack', 'npm',
      [ 'pack', '--json', '--ignore-scripts', '--pack-destination', directory ], root));
    assert.equal(packed.length, 1);
    const filename = packed[0].filename;
    assert.match(filename, /^[A-Za-z0-9._-]+\.tgz$/);
    const tarball = path.join(directory, filename);
    const consumer = path.join(temp, 'consumer');
    await mkdir(consumer);
    await writeFile(path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'release-evidence-consumer', version: '1.0.0', private: true }) + '\n');
    command('packed consumer install', 'npm',
      [ 'install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', tarball ], consumer);
    const installed = JSON.parse(await readFile(path.join(consumer, 'node_modules', packageJson.name,
      'package.json'), 'utf8'));
    assert.equal(installed.version, packageJson.version, 'Installed package version differs from source.');
    // npm sbom rejects the installed tree's local file:./archimate-font dependency
    // outside this repository. Use the committed lockfile's production graph.
    const sbomText = command('SPDX SBOM', 'npm',
      [ 'sbom', '--sbom-format=spdx', '--omit=dev', '--package-lock-only' ], root);
    const sbom = JSON.parse(sbomText);
    assert.match(sbom.spdxVersion, /^SPDX-/);
    assert.ok(sbom.packages?.some((item) => item.name === packageJson.name &&
      item.versionInfo === packageJson.version), 'SBOM is missing the installed package.');
    const sbomBytes = Buffer.from(JSON.stringify(sbom, null, 2) + '\n');
    await writeFile(path.join(directory, 'sbom.spdx.json'), sbomBytes);
    const tarballHash = digest(await readFile(tarball));
    const sbomHash = digest(sbomBytes);
    const manifest = {
      schemaVersion: 1,
      package: { name: packageJson.name, version: packageJson.version },
      sourceSha,
      workflowRun: runId ? `https://github.com/Tigon32/archimate-js/actions/runs/${runId}` : null,
      toolchain: { node: process.version, npm: command('npm version', 'npm', [ '--version' ], root).trim() },
      inputs: {
        packageJsonSha256: digest(await readFile(path.join(root, 'package.json'))),
        packageLockSha256: digest(await readFile(path.join(root, 'package-lock.json')))
      },
      checks: { releaseCheck: 'passed', packedInstall: 'passed', sbom: 'passed' },
      sbomSource: 'committed package-lock.json, production dependencies',
      artifacts: { tarball: { name: filename, sha256: tarballHash }, sbom: { name: 'sbom.spdx.json', sha256: sbomHash } }
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(path.join(directory, 'manifest.json'), manifestBytes);
    await writeFile(path.join(directory, 'SHA256SUMS'),
      `${tarballHash}  ${filename}\n${sbomHash}  sbom.spdx.json\n${digest(manifestBytes)}  manifest.json\n`);
    await verifyReleaseEvidence(directory);
    return manifest;
  } catch (error) {
    if (ownsDestination) await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.env.RELEASE_EVIDENCE_DIR;
  assert.ok(destination && path.isAbsolute(destination), 'RELEASE_EVIDENCE_DIR must be absolute.');
  await createReleaseEvidence(destination);
  console.log('Release evidence generated and verified.');
}
