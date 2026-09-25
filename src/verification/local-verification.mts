export const LOCAL_VERIFICATION_PROFILE = 'verify:local/v1';

export interface LocalVerificationFingerprint {
  sha: string;
  branch: string;
  profile: string;
  node: string;
  npm: string;
  platform: string;
  architecture: string;
  packageDigest: string;
  lockDigest: string;
}

export interface LocalVerificationReceipt {
  schema: 'archimate-js.local-verification/v1';
  state: 'verified';
  verifiedAt: string;
  fingerprint: LocalVerificationFingerprint;
}

export interface LocalVerificationState {
  schema: 'archimate-js.local-verification/v1';
  runId: string;
  state: 'running' | 'verified' | 'failed' | 'cancelled' | 'stale';
  startedAt: string;
  finishedAt?: string;
  pid?: number;
  exitCode?: number;
  reason?: string;
  logPath?: string;
  history?: Array<{ runId: string; state: 'failed' | 'cancelled' | 'stale'; finishedAt: string; reason?: string }>;
  fingerprint: LocalVerificationFingerprint;
}

export type LocalVerificationStatus = 'verified' | 'running' | 'failed' | 'cancelled' | 'stale' | 'unverified';

export function isFingerprint(value: unknown): value is LocalVerificationFingerprint {
  if (!value || typeof value !== 'object') return false;
  const fingerprint = value as Partial<LocalVerificationFingerprint>;
  return ['sha', 'branch', 'profile', 'node', 'npm', 'platform', 'architecture', 'packageDigest', 'lockDigest']
    .every((key) => typeof fingerprint[key as keyof LocalVerificationFingerprint] === 'string');
}

export function fingerprintsMatch(
  left: LocalVerificationFingerprint | undefined,
  right: LocalVerificationFingerprint
): boolean {
  if (!left || !isFingerprint(left)) return false;
  return left.sha === right.sha
    && left.branch === right.branch
    && left.profile === right.profile
    && left.node === right.node
    && left.npm === right.npm
    && left.platform === right.platform
    && left.architecture === right.architecture
    && left.packageDigest === right.packageDigest
    && left.lockDigest === right.lockDigest;
}

export function isReusableReceipt(
  receipt: LocalVerificationReceipt | undefined,
  current: LocalVerificationFingerprint,
  workingTreeClean: boolean
): boolean {
  return workingTreeClean
    && receipt?.schema === 'archimate-js.local-verification/v1'
    && receipt.state === 'verified'
    && fingerprintsMatch(receipt.fingerprint, current);
}

export function classifyLocalVerification(
  current: LocalVerificationFingerprint,
  state: LocalVerificationState | undefined,
  receipt: LocalVerificationReceipt | undefined,
  workingTreeClean: boolean
): LocalVerificationStatus {
  if (isReusableReceipt(receipt, current, workingTreeClean)) return 'verified';
  if (state && fingerprintsMatch(state.fingerprint, current)) {
    if (state.state === 'running' && typeof state.pid === 'number') return 'running';
    if (state.state === 'failed' || state.state === 'cancelled') return state.state;
  }
  if ((state && state.fingerprint?.sha === current.sha)
    || (receipt && receipt.fingerprint?.sha === current.sha)) return 'stale';
  return 'unverified';
}

export function shouldReuseRunningRun(
  state: LocalVerificationState | undefined,
  current: LocalVerificationFingerprint
): boolean {
  return Boolean(state && state.state === 'running' && typeof state.pid === 'number'
    && fingerprintsMatch(state.fingerprint, current));
}
