import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const APPROVED_LICENSES = Object.freeze([
  'MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
  'MPL-2.0', 'CC0-1.0', 'OFL-1.1', 'CC-BY-3.0', 'CC-BY-4.0', 'BlueOak-1.0.0'
]);

function allowedLicense(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (APPROVED_LICENSES.includes(value)) return true;
  // Handle simple SPDX AND/OR expressions. Other expressions require review.
  const expression = value.replace(/^\((.*)\)$/, '$1');
  const parts = expression.split(/\s+(?:AND|OR)\s+/);
  return parts.length > 1 && parts.every((part) => APPROVED_LICENSES.includes(part)) &&
    /^[A-Za-z0-9.+-]+(?:\s+(?:AND|OR)\s+[A-Za-z0-9.+-]+)+$/.test(expression);
}

function validateExceptions(policy, today) {
  assert.equal(policy.schemaVersion, 1);
  assert.ok(Array.isArray(policy.exceptions));
  const entries = new Map();
  for (const exception of policy.exceptions) {
    assert.deepEqual(Object.keys(exception).sort(),
      [ 'path', 'version', 'license', 'owner', 'reason', 'expiresOn' ].sort());
    assert.match(exception.path, /^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/);
    assert.ok(typeof exception.version === 'string' && exception.version.length);
    assert.ok(exception.license === null || typeof exception.license === 'string');
    assert.ok(typeof exception.owner === 'string' && exception.owner.trim());
    assert.ok(typeof exception.reason === 'string' && exception.reason.trim());
    assert.match(exception.expiresOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(`${exception.expiresOn}T00:00:00Z`)));
    assert.equal(new Date(`${exception.expiresOn}T00:00:00Z`).toISOString().slice(0, 10),
      exception.expiresOn, 'Invalid dependency exception date.');
    assert.ok(exception.expiresOn >= today, 'Expired dependency exception.');
    const key = JSON.stringify([exception.path, exception.version, exception.license]);
    assert.ok(!entries.has(key), 'Duplicate dependency exception.');
    entries.set(key, exception);
  }
  return entries;
}

function changed(before, after) {
  return !before || [ 'version', 'resolved', 'integrity', 'license', 'link' ]
    .some((field) => before[field] !== after[field]);
}

/** Fail closed for added or changed lockfile entries with missing or unapproved metadata. */
export function checkDependencyChanges(base, head, policy, today = new Date().toISOString().slice(0, 10)) {
  assert.ok(base?.packages && head?.packages, 'Package lockfiles are required.');
  const exceptions = validateExceptions(policy, today);
  const failures = [];
  for (const [packagePath, entry] of Object.entries(head.packages)) {
    if (!packagePath.startsWith('node_modules/') || !changed(base.packages[packagePath], entry)) continue;
    if (allowedLicense(entry.license)) continue;
    const key = JSON.stringify([packagePath, entry.version ?? null, entry.license ?? null]);
    if (!exceptions.has(key)) failures.push(`${packagePath}@${entry.version ?? 'unversioned'}`);
  }
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const baseSha = process.env.DEPENDENCY_POLICY_BASE;
  assert.match(baseSha ?? '', /^[0-9a-f]{40}$/, 'A pull-request base SHA is required.');
  const base = JSON.parse(execFileSync('git', [ 'show', `${baseSha}:package-lock.json` ],
    { cwd: root, encoding: 'utf8' }));
  const head = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const policy = JSON.parse(readFileSync(new URL('../docs/security/dependency-exceptions.json', import.meta.url), 'utf8'));
  const failures = checkDependencyChanges(base, head, policy);
  if (failures.length) {
    for (const item of failures) console.error(`Dependency license review required: ${item}`);
    process.exitCode = 1;
  } else {
    console.log('Changed dependency license metadata passed policy.');
  }
}
