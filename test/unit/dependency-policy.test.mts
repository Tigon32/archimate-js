// SYNTHETIC: Package names and licenses below exercise policy without private data.
import { expect, test } from 'vitest';
import { checkDependencyChanges } from '../../scripts/check-dependency-policy.mjs';

const before = { packages: { '': { name: 'example' },
  'node_modules/old': { version: '1.0.0', license: 'SIL' } } };
const policy = { schemaVersion: 1, exceptions: [] };
const changed = (license: string | undefined, version = '1.0.0') => ({ packages: {
  ...before.packages, 'node_modules/new': { version, license }
} });

test('allows reviewed SPDX identifiers and combinations on changed packages', () => {
  expect(checkDependencyChanges(before, changed('MIT'), policy, '2026-09-24')).toEqual([]);
  expect(checkDependencyChanges(before, changed('(MIT OR CC0-1.0)'), policy, '2026-09-24')).toEqual([]);
  expect(checkDependencyChanges(before, before, policy, '2026-09-24')).toEqual([]);
});

test('fails closed on missing, non-SPDX, and unapproved license metadata', () => {
  for (const license of [undefined, 'SIL', 'GPL-3.0-only', 'MIT OR GPL-3.0-only']) {
    expect(checkDependencyChanges(before, changed(license), policy, '2026-09-24'))
      .toEqual(['node_modules/new@1.0.0']);
  }
  const upgrade = { packages: { ...before.packages,
    'node_modules/old': { version: '2.0.0', license: 'SIL' } } };
  expect(checkDependencyChanges(before, upgrade, policy, '2026-09-24'))
    .toEqual(['node_modules/old@2.0.0']);
});

test('exceptions are exact, owned, and expire', () => {
  const exception = { path: 'node_modules/new', version: '1.0.0', license: null,
    owner: 'reviewer', reason: 'Synthetic license review', expiresOn: '2026-10-01' };
  const reviewed = { schemaVersion: 1, exceptions: [exception] };
  expect(checkDependencyChanges(before, changed(undefined), reviewed, '2026-09-24')).toEqual([]);
  expect(checkDependencyChanges(before, changed(''), reviewed, '2026-09-24'))
    .toEqual(['node_modules/new@1.0.0']);
  expect(checkDependencyChanges(before, changed('SIL'), reviewed, '2026-09-24'))
    .toEqual(['node_modules/new@1.0.0']);
  expect(checkDependencyChanges(before, changed(undefined, '2.0.0'), reviewed, '2026-09-24'))
    .toEqual(['node_modules/new@2.0.0']);
  expect(() => checkDependencyChanges(before, changed(undefined), reviewed, '2026-10-02'))
    .toThrow(/Expired dependency exception/);
  expect(() => checkDependencyChanges(before, changed(undefined), { schemaVersion: 1,
    exceptions: [{ ...exception, expiresOn: '2026-02-30' }] }, '2026-02-01'))
    .toThrow(/Invalid dependency exception date/);
});
