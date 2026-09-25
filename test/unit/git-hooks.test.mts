// @ts-expect-error Node types are intentionally excluded from the default test type surface.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Node types are intentionally excluded from the default test type surface.
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
// @ts-expect-error Node types are intentionally excluded from the default test type surface.
import { tmpdir } from 'node:os';
// @ts-expect-error Node types are intentionally excluded from the default test type surface.
import path from 'node:path';
// @ts-expect-error Node types are intentionally excluded from the default test type surface.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '../..');

describe('local verification gate', () => {
  it('wires the versioned pre-push hook to the canonical local gate', () => {
    const hookPath = path.join(repositoryRoot, '.githooks/pre-push');
    const hook = readFileSync(hookPath, 'utf8');

    expect(hook).toContain('npm run verify:wip');

    if (process.platform !== 'win32') {
      expect(statSync(hookPath).mode & 0o111).not.toBe(0);
    }
  });

  it('starts background verification from a non-blocking post-commit hook', () => {
    const hookPath = path.join(repositoryRoot, '.githooks/post-commit');
    const hook = readFileSync(hookPath, 'utf8');
    expect(hook).toContain('node scripts/local-verification.mts trigger');
    expect(hook).not.toContain('npm run verify:local:run');
    if (process.platform !== 'win32') expect(statSync(hookPath).mode & 0o111).not.toBe(0);
  });

  it('installs hooks in a fresh Git checkout with no prior hook configuration', () => {
    const checkout = mkdtempSync(path.join(tmpdir(), 'archimate-js-hooks-'));

    try {
      execFileSync('git', ['init', '--quiet'], { cwd: checkout });
      const stdout = execFileSync(
        process.argv[0],
        [path.join(repositoryRoot, 'scripts/install-git-hooks.mjs')],
        { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      expect(stdout).toBe('');

      const configuredPath = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], {
        cwd: checkout,
        encoding: 'utf8'
      }).trim();

      expect(configuredPath).toBe('.githooks');
    } finally {
      rmSync(checkout, { recursive: true, force: true });
    }
  });

  it('installs hooks and orders deterministic checks before remote escalation', () => {
    const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

    expect(packageJson.scripts.prepare).toBe('node scripts/install-git-hooks.mjs');
    expect(packageJson.scripts['hooks:install']).toBe('node scripts/install-git-hooks.mjs');
    expect(packageJson.scripts['verify:wip']).toBe('run-s check:source-policy test:relationship-matrix lint test:typecheck test:validator-build');
    expect(packageJson.scripts['verify:local']).toBe('node scripts/local-verification.mts ensure');
    expect(packageJson.scripts['verify:local:run']).toBe('run-s check:source-policy lint test compile');
    expect(packageJson.scripts['verify:local:start']).toBe('node scripts/local-verification.mts start');
    expect(packageJson.scripts['verify:local:status']).toBe('node scripts/local-verification.mts status');
  });
});
