import { describe, expect, it } from 'vitest';
import {
  classifyLocalVerification,
  fingerprintsMatch,
  isReusableReceipt,
  shouldReuseRunningRun,
  type LocalVerificationFingerprint,
  type LocalVerificationReceipt,
  type LocalVerificationState
} from '../../src/verification/local-verification.mjs';

const fingerprint: LocalVerificationFingerprint = {
  sha: '0123456789abcdef0123456789abcdef01234567',
  branch: 'agent/synthetic/issue-214',
  profile: 'verify:local/v1',
  node: 'v24.0.0',
  npm: '11.0.0',
  platform: 'linux',
  architecture: 'x64',
  packageDigest: 'package-digest',
  lockDigest: 'lock-digest'
};

const receipt: LocalVerificationReceipt = {
  schema: 'archimate-js.local-verification/v1',
  state: 'verified',
  verifiedAt: '2026-09-25T00:00:00.000Z',
  fingerprint
};

const running: LocalVerificationState = {
  schema: 'archimate-js.local-verification/v1',
  runId: 'synthetic-run-1',
  state: 'running',
  startedAt: '2026-09-25T00:00:00.000Z',
  pid: 10,
  fingerprint
};

describe('local verification receipt contract', () => {
  it('reuses only a clean exact-subject and environment match', () => {
    expect(isReusableReceipt(receipt, fingerprint, true)).toBe(true);
    expect(isReusableReceipt(receipt, fingerprint, false)).toBe(false);
    expect(isReusableReceipt(receipt, { ...fingerprint, sha: 'fedcba9876543210fedcba9876543210fedcba98' }, true)).toBe(false);
  });

  it('rejects receipts after toolchain, profile, platform, package, or lock identity changes', () => {
    for (const change of [
      { node: 'v22.0.0' },
      { npm: '10.0.0' },
      { profile: 'verify:local/v2' },
      { platform: 'darwin' },
      { architecture: 'arm64' },
      { packageDigest: 'changed-package' },
      { lockDigest: 'changed-lock' }
    ]) {
      expect(fingerprintsMatch({ ...fingerprint, ...change }, fingerprint)).toBe(false);
    }
  });

  it('distinguishes current run, failed, cancelled, stale, and unverified states', () => {
    expect(classifyLocalVerification(fingerprint, running, undefined, true)).toBe('running');
    expect(classifyLocalVerification(fingerprint, { ...running, state: 'failed' }, undefined, true)).toBe('failed');
    expect(classifyLocalVerification(fingerprint, { ...running, state: 'cancelled' }, undefined, true)).toBe('cancelled');
    expect(classifyLocalVerification({ ...fingerprint, node: 'v22.0.0' }, running, receipt, true)).toBe('stale');
    expect(classifyLocalVerification({ ...fingerprint, sha: 'fedcba9876543210fedcba9876543210fedcba98' }, undefined, undefined, true)).toBe('unverified');
  });

  it('reuses only a live run for the same complete fingerprint', () => {
    expect(shouldReuseRunningRun(running, fingerprint)).toBe(true);
    expect(shouldReuseRunningRun({ ...running, fingerprint: { ...fingerprint, sha: 'fedcba9876543210fedcba9876543210fedcba98' } }, fingerprint)).toBe(false);
  });
});
