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
assert.match(workflow, /^permissions:\n[ ]{2}contents: read$/m);
assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
assert.doesNotMatch(workflow, /pull_request_target|secrets\./i);
assert.match(releaseWorkflow, /^permissions:\n[ ]{2}contents: read$/m);
assert.match(releaseWorkflow, /actions\/checkout@[0-9a-f]{40}/);
assert.match(releaseWorkflow, /actions\/setup-node@[0-9a-f]{40}/);
assert.match(releaseWorkflow, /npm run release:check/);
assert.doesNotMatch(releaseWorkflow, /secrets\.|npm publish|id-token:\s*write/i);
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
assert.match(packageJson, /"test:supply-chain": "node test\/security\/supply-chain\.test\.mjs"/);

console.log('Supply-chain policy test passed.');
