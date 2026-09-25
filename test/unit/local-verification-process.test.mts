/// <reference types="node" />
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { terminateRunProcess, verificationEnvironment } from '../../scripts/local-verification.mts';
import { failureLogExcerpt } from '../../src/verification/local-verification-diagnostics.mts';

const workerScript = fileURLToPath(new URL('../../scripts/local-verification.mts', import.meta.url));

describe('local verification process control', () => {
  it('removes Git hook repository overrides from verification subprocesses', () => {
    const environment = verificationEnvironment({
      PATH: '/synthetic/bin',
      GIT_DIR: '/synthetic/repo/.git',
      GIT_WORK_TREE: '/synthetic/repo',
      GIT_INDEX_FILE: '/synthetic/repo/.git/index',
      GIT_CONFIG_COUNT: '1'
    });
    expect(environment).toEqual({ PATH: '/synthetic/bin' });
  });

  it('bounds failed verification output to the latest diagnostic tail', () => {
    expect(failureLogExcerpt('synthetic failure output')).toBe('synthetic failure output');
    const contents = 'x'.repeat(16_100);
    const excerpt = failureLogExcerpt(contents);
    expect(excerpt).toContain('truncated to last 16000 characters');
    expect(excerpt.endsWith('x'.repeat(16_000))).toBe(true);
  });

  it('terminates the exact superseded worker process group', async () => {
    const runId = `synthetic-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const child = spawn(process.execPath, [workerScript, 'worker', runId], {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      stdio: 'ignore'
    });
    await new Promise((resolve) => child.once('spawn', resolve));
    expect(child.pid).toBeTruthy();
    expect(terminateRunProcess(child.pid!, runId)).toBe(true);
  }, 10_000);
});
