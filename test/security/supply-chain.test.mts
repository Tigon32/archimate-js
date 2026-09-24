import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [dependabot, workflow, releaseWorkflow, policy, notices, readme, packageJson, archimateFontLicense, fontAwesomeLicense] = await Promise.all([
  readFile(new URL('../../.github/dependabot.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/release-gate.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../docs/security/dependency-policy.md', import.meta.url), 'utf8'),
  readFile(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'),
  readFile(new URL('../../README.md', import.meta.url), 'utf8'),
  readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../../assets/archimate-font/OFL.txt', import.meta.url), 'utf8'),
  readFile(new URL('../../assets/font-awesome-5/OFL.txt', import.meta.url), 'utf8')
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
assert.doesNotMatch(releaseWorkflow, /secrets\.|npm publish/i);
assert.match(releaseWorkflow, /^on:\n  workflow_dispatch:\n  push:\n    tags:\n      - 'v\*'$/m);

const readiness = releaseWorkflow.split(/^  release-readiness:$/m)[1]?.split(/^  attest-release:$/m)[0];
const attestation = releaseWorkflow.split(/^  attest-release:$/m)[1];
assert.ok(readiness && attestation, 'release workflow must contain separate readiness and attestation jobs');
assert.match(readiness, /^    permissions:\n      contents: read\n\n    steps:$/m);
assert.doesNotMatch(readiness, /id-token:\s*write|attestations:\s*write/);
assert.match(attestation, /^    if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)$/m);
assert.match(attestation, /^    needs: release-readiness$/m);
assert.match(attestation, /^    permissions:\n      contents: read\n      id-token: write\n      attestations: write\n\n    steps:$/m);
assert.match(attestation, /actions\/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131/);
assert.match(attestation, /actions\/attest@1e69f48acb82d1966a394da916b4c1698aa569d6/);
assert.ok(attestation.includes('name: release-evidence'));
assert.ok(attestation.includes('sha256sum --status --check SHA256SUMS'));
assert.ok(attestation.includes('test "${#tarballs[@]}" -eq 1'));
assert.ok(attestation.includes('subject-path: ${{ steps.tarball.outputs.path }}'));
assert.match(policy, /npm audit/);
assert.match(policy, /No dependency update is auto-merged/);
assert.match(policy, /SPDX SBOM/);
assert.match(notices, /OFL 1\.1/);
assert.match(notices, /MIT/);
assert.match(notices, /Font Awesome/);
assert.match(notices, /IBM Plex/);
assert.match(notices, /assets\/archimate-font\/OFL\.txt/);
assert.match(archimateFontLicense, /SIL OPEN FONT LICENSE/);
assert.match(fontAwesomeLicense, /Reserved Font Name "Font Awesome"/);
assert.match(notices, /no GPL-licensed dependency or asset/i);
assert.match(readme, /\[third-party notices\]\(THIRD_PARTY_NOTICES\.md\)/);
assert.match(packageJson, /"test:supply-chain": "node test\/security\/supply-chain\.test\.mts"/);

console.log('Supply-chain policy test passed.');
