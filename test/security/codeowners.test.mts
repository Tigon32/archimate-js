import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const codeownersPath = new URL('../../.github/CODEOWNERS', import.meta.url);
interface OwnershipRule {
  pattern: string;
  owners: string[];
}

const rules: OwnershipRule[] = (await readFile(codeownersPath, 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line): OwnershipRule => {
    const [pattern, ...owners] = line.split(/\s+/);
    return { pattern: pattern ?? '', owners };
  });

function ownersFor(path: string): string[] {
  const matched = rules.filter(({ pattern }) => {
    const rootedPattern = pattern.replace(/^\//, '');
    const expression = rootedPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000/g, '.*');

    return new RegExp(`^${expression}$`).test(path);
  });

  return matched.at(-1)?.owners ?? [];
}

test('governance paths are assigned to the human repository owner', () => {
  const governedPaths: string[] = [
    '.github/CODEOWNERS',
    'AGENTS.md',
    'docs/adr/0001-public-clean-room-boundary.md',
    'test/fixtures/manifest.json',
    'docs/research/sources.yaml',
    'docs/research/okf/index.md',
    'scripts/check-dependency-policy.mjs',
    'scripts/check-provenance.mjs',
    'scripts/check-source-policy.mjs',
    'scripts/check-secrets.mts',
    'scripts/check-tracked-paths.mts',
    'scripts/create-release-evidence.mjs',
    'scripts/verify-release-evidence.mts',
    'scripts/source-policy-exceptions.json',
    'scripts/dependency-maintenance-queue.mjs',
    '.github/workflows/ci.yml'
  ];

  for (const path of governedPaths) {
    assert.deepEqual(ownersFor(path), ['@Tigon32'], `${path} must be owner-reviewed`);
  }
});

test('application source remains outside the governance ownership map', () => {
  assert.deepEqual(ownersFor('src/model/index.ts'), []);
});
