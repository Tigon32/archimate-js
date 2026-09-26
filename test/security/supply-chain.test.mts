import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [dependabot, workflow, releaseWorkflow, policy, notices, readme, packageJson, archimateFontLicense, fontAwesomeLicense, elkjsLicense] = await Promise.all([
  readFile(new URL('../../.github/dependabot.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/release-gate.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../docs/security/dependency-policy.md', import.meta.url), 'utf8'),
  readFile(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'),
  readFile(new URL('../../README.md', import.meta.url), 'utf8'),
  readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../../assets/archimate-font/OFL.txt', import.meta.url), 'utf8'),
  readFile(new URL('../../assets/font-awesome-5/OFL.txt', import.meta.url), 'utf8'),
  readFile(new URL('../../licenses/elkjs-EPL-2.0.txt', import.meta.url), 'utf8')
]);

assert.match(dependabot, /package-ecosystem: npm/);
assert.match(dependabot, /package-ecosystem: github-actions/);
assert.equal((dependabot.match(/directory: \/archimate-font/g) || []).length, 1);
assert.match(dependabot, /update-types:[\s\S]*- minor[\s\S]*- patch/);

for (const contents of [ workflow, releaseWorkflow ]) {
  const actionReferences = [ ...contents.matchAll(/^\s*uses:\s*(\S+)/gm) ].map((match) => match[1]);

  assert.ok(actionReferences.length > 0);

  for (const reference of actionReferences) {
    assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/);
  }
}

assert.match(workflow, /^permissions:\n[ ]{2}contents: read$/m);
assert.match(workflow, /runs-on: ubuntu-24\.04/);
assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/);
for (const action of [ 'checkout', 'setup-node', 'upload-artifact' ]) {
  assert.match(workflow, new RegExp(`actions/${action}@[0-9a-f]{40}`));
}
assert.doesNotMatch(workflow, /pull_request_target|secrets\./i);
assert.match(releaseWorkflow, /^permissions:\n  contents: read\n\njobs:$/m);
assert.match(releaseWorkflow, /runs-on: ubuntu-24\.04/);
assert.doesNotMatch(releaseWorkflow, /runs-on: ubuntu-latest/);
for (const action of [ 'checkout', 'setup-node' ]) {
  assert.match(releaseWorkflow, new RegExp(`actions/${action}@[0-9a-f]{40}`));
}
assert.match(releaseWorkflow, /npm run release:check/);
assert.doesNotMatch(releaseWorkflow, /pull_request_target|secrets\.|npm publish/i);
assert.ok(releaseWorkflow.includes("pull_request:\n    paths:\n      - '.github/workflows/release-gate.yml'"));
assert.match(releaseWorkflow, /workflow_dispatch:/);
assert.match(releaseWorkflow, /push:\n    tags:/);

const readiness = releaseWorkflow.split(/^  release-readiness:$/m)[1]?.split(/^  download-artifact-smoke:$/m)[0];
const smoke = releaseWorkflow.split(/^  download-artifact-smoke:$/m)[1]?.split(/^  attest-release:$/m)[0];
const attestation = releaseWorkflow.split(/^  attest-release:$/m)[1];
assert.ok(readiness && smoke && attestation, 'release workflow must contain separate readiness, smoke, and attestation jobs');
assert.match(readiness, /^    if: github\.event_name != 'pull_request'$/m);
assert.match(readiness, /^    permissions:\n      contents: read\n\n    steps:$/m);
assert.doesNotMatch(readiness, /id-token:\s*write|attestations:\s*write/);
assert.match(smoke, /^    if: github\.event_name == 'pull_request'$/m);
assert.match(smoke, /^    permissions:\n      contents: read\n\n    steps:$/m);
assert.match(smoke, /SYNTHETIC fixture for actions\/download-artifact v8 integration test/);
assert.ok(smoke.includes('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'));
assert.ok(smoke.includes('actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c'));
assert.ok(smoke.includes('name: synthetic-release-evidence'));
assert.ok(smoke.includes('sha256sum --status --check SHA256SUMS'));
assert.ok(smoke.includes('test "${#tarballs[@]}" -eq 1'));
assert.ok(smoke.includes('tar -xzf'));
assert.match(attestation, /^    if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)$/m);
assert.match(attestation, /^    needs: release-readiness$/m);
assert.match(attestation, /^    permissions:\n      contents: read\n      id-token: write\n      attestations: write\n\n    steps:$/m);
assert.ok(attestation.includes('actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c'));
assert.deepEqual(
  [ ...releaseWorkflow.matchAll(/actions\/download-artifact@([0-9a-f]{40})/g) ].map((match) => match[1]),
  [ '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c', '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c' ]
);
assert.match(attestation, /actions\/attest@1e69f48acb82d1966a394da916b4c1698aa569d6/);
assert.ok(attestation.includes('name: release-evidence'));
assert.ok(attestation.includes('sha256sum --status --check SHA256SUMS'));
assert.ok(attestation.includes('test "${#tarballs[@]}" -eq 1'));
assert.ok(attestation.includes('subject-path: ${{ steps.tarball.outputs.path }}'));
assert.doesNotMatch(readiness, /actions\/download-artifact/);
assert.match(policy, /npm audit/);
assert.match(policy, /No dependency update is auto-merged/);
assert.match(policy, /SPDX SBOM/);
assert.match(notices, /OFL 1\.1/);
assert.match(notices, /MIT/);
assert.match(notices, /Font Awesome/);
assert.match(notices, /IBM Plex/);
assert.match(notices, /assets\/archimate-font\/OFL\.txt/);
assert.match(notices, /elkjs@0\.12\.0/);
assert.match(notices, /EPL-2\.0.*GPL-3\.0-or-later/s);
assert.match(elkjsLicense, /Eclipse Public License - v 2\.0/);
assert.match(archimateFontLicense, /SIL OPEN FONT LICENSE/);
assert.match(fontAwesomeLicense, /Reserved Font Name "Font Awesome"/);
assert.match(notices, /no GPL-licensed dependency or asset/i);
assert.match(readme, /\[third-party notices\]\(THIRD_PARTY_NOTICES\.md\)/);
assert.match(packageJson, /"test:supply-chain": "node test\/security\/supply-chain\.test\.mts"/);

console.log('Supply-chain policy test passed.');
