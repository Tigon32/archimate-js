/// <reference types="node" />
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyLocalVerification,
  fingerprintsMatch,
  isFingerprint,
  isReusableReceipt,
  LOCAL_VERIFICATION_PROFILE,
  shouldReuseRunningRun,
  type LocalVerificationFingerprint,
  type LocalVerificationReceipt,
  type LocalVerificationState
} from '../src/verification/local-verification.mts';

interface Paths {
  root: string;
  directory: string;
  state: string;
  receipt: string;
  lock: string;
}

interface LockOwner {
  pid: number;
  token: string;
  createdAt: string;
}

const SCHEMA = 'archimate-js.local-verification/v1';
const LOCK_WAIT_MS = 60 * 60 * 1000;
const VERIFY_SCRIPT = fileURLToPath(import.meta.url);
const GIT_LOCAL_ENVIRONMENT = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS', 'GIT_REPLACE_REF_BASE', 'GIT_PREFIX',
  'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR'
];

export function verificationEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const key of GIT_LOCAL_ENVIRONMENT) delete environment[key];
  return environment;
}

function captureGit(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function resolvePaths(): Paths {
  const root = captureGit(process.cwd(), ['rev-parse', '--show-toplevel']);
  const gitDirectory = path.resolve(root, captureGit(root, ['rev-parse', '--git-dir']));
  const directory = path.join(gitDirectory, 'archimate-js-local-verification');
  mkdirSync(directory, { recursive: true });
  return {
    root,
    directory,
    state: path.join(directory, 'state.json'),
    receipt: path.join(directory, 'receipt.json'),
    lock: path.join(directory, 'operation.lock')
  };
}

function sha256(contents: string | Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

function fingerprint(root: string): LocalVerificationFingerprint {
  const sha = captureGit(root, ['rev-parse', 'HEAD']);
  const branch = captureGit(root, ['branch', '--show-current']) || '(detached)';
  const packageData = readFileSync(path.join(root, 'package.json'));
  const lockData = readFileSync(path.join(root, 'package-lock.json'));
  const npm = execFileSync('npm', ['--version'], { cwd: root, encoding: 'utf8' }).trim();
  return {
    sha,
    branch,
    profile: LOCAL_VERIFICATION_PROFILE,
    node: process.version,
    npm,
    platform: process.platform,
    architecture: process.arch,
    packageDigest: sha256(packageData),
    lockDigest: sha256(lockData)
  };
}

function isWorkingTreeClean(root: string): boolean {
  return captureGit(root, ['status', '--porcelain', '--untracked-files=normal']) === '';
}

function readObject<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function atomicWrite(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, file);
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function staleLock(paths: Paths): boolean {
  try {
    const owner = readObject<LockOwner>(paths.lock);
    if (owner && Number.isInteger(owner.pid)) return !processIsAlive(owner.pid);
    return Date.now() - statSync(paths.lock).mtimeMs > 30_000;
  } catch {
    return !existsSync(paths.lock);
  }
}

function acquireLock(paths: Paths): () => void {
  const deadline = Date.now() + LOCK_WAIT_MS;
  const token = randomUUID();
  while (Date.now() < deadline) {
    try {
      const descriptor = openSync(paths.lock, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() } satisfies LockOwner));
      closeSync(descriptor);
      return () => releaseLock(paths, token);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (staleLock(paths)) {
        try { unlinkSync(paths.lock); } catch { /* Another waiter reclaimed it. */ }
        continue;
      }
      sleepSync(50);
    }
  }
  throw new Error('Timed out waiting for the local verification operation lock.');
}

function releaseLock(paths: Paths, token: string): void {
  const owner = readObject<LockOwner>(paths.lock);
  if (owner?.token === token) unlinkSync(paths.lock);
}

function withLock<T>(paths: Paths, operation: () => T): T {
  const release = acquireLock(paths);
  try {
    return operation();
  } finally {
    release();
  }
}

function writeState(paths: Paths, state: LocalVerificationState): void {
  atomicWrite(paths.state, state);
}

function readState(paths: Paths): LocalVerificationState | undefined {
  const state = readObject<LocalVerificationState>(paths.state);
  return state?.schema === SCHEMA && typeof state.runId === 'string' && isFingerprint(state.fingerprint)
    ? state
    : undefined;
}

function readReceipt(paths: Paths): LocalVerificationReceipt | undefined {
  const receipt = readObject<LocalVerificationReceipt>(paths.receipt);
  return receipt?.schema === SCHEMA && receipt.state === 'verified'
    && typeof receipt.verifiedAt === 'string' && isFingerprint(receipt.fingerprint)
    ? receipt
    : undefined;
}

function processCommand(pid: number): string | undefined {
  if (process.platform === 'win32') return undefined;
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

function ownsRunProcess(pid: number, runId: string): boolean {
  const command = processCommand(pid);
  return Boolean(command && command.includes(VERIFY_SCRIPT) && command.includes(runId));
}

function processGroupHasActiveProcess(pid: number): boolean {
  if (process.platform === 'win32') return processIsAlive(pid);
  try {
    const states = execFileSync('ps', ['-g', String(pid), '-o', 'stat='], { encoding: 'utf8' });
    return states.split(/\r?\n/).some((state) => state.trim() && !state.trim().startsWith('Z'));
  } catch {
    return false;
  }
}

function waitForGroupExit(pid: number, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processGroupHasActiveProcess(pid)) return true;
    sleepSync(50);
  }
  return !processGroupHasActiveProcess(pid);
}

export function terminateRunProcess(pid: number, runId: string): boolean {
  if (!processGroupHasActiveProcess(pid)) return true;
  if (process.platform === 'win32') {
    return terminateWindowsTree(pid, runId);
  }
  if (!ownsRunProcess(pid, runId)) return false;
  try { process.kill(-pid, 'SIGTERM'); } catch { return !processGroupHasActiveProcess(pid); }
  if (waitForGroupExit(pid, 2_000)) return true;
  try { process.kill(-pid, 'SIGKILL'); } catch { return !processGroupHasActiveProcess(pid); }
  return waitForGroupExit(pid, 2_000);
}

function terminateWindowsTree(pid: number, runId: string): boolean {
  const command = `$p=Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\"; if (!$p -or !$p.CommandLine.Contains('${runId}')) { exit 2 }; taskkill /PID ${pid} /T /F | Out-Null`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'ignore' });
  return result.status === 0 || !processIsAlive(pid);
}

function snapshot(paths: Paths): LocalVerificationFingerprint {
  return fingerprint(paths.root);
}

function statusFor(paths: Paths, current: LocalVerificationFingerprint): LocalVerificationState['state'] | 'unverified' {
  const state = readState(paths);
  const receipt = readReceipt(paths);
  const clean = isWorkingTreeClean(paths.root);
  const result = classifyLocalVerification(current, state, receipt, clean);
  if (result === 'running' && state?.pid && !processGroupHasActiveProcess(state.pid)) return 'stale';
  return result;
}

function startBackground(paths: Paths): string {
  return withLock(paths, () => {
    const current = snapshot(paths);
    if (isReusableReceipt(readReceipt(paths), current, isWorkingTreeClean(paths.root))) return 'verified';
    const previous = readState(paths);
    if (shouldReuseRunningRun(previous, current) && previous?.pid && processIsAlive(previous.pid)) return 'running';
    let history = previous?.history ?? [];
    if (previous?.state === 'running' && previous.pid) {
      if (!terminateRunProcess(previous.pid, previous.runId)) {
        throw new Error('Could not safely terminate the superseded verification process tree.');
      }
      const finishedAt = new Date().toISOString();
      history = appendHistory(history, { runId: previous.runId, state: 'cancelled', finishedAt, reason: 'superseded by a newer subject' });
      writeState(paths, { ...previous, state: 'cancelled', finishedAt, reason: 'superseded by a newer subject', history });
    } else if (previous && previous.state !== 'verified') {
      history = appendHistory(history, previousRunEntry(previous));
    }
    return launchWorker(paths, current, history);
  });
}

function appendHistory(
  history: NonNullable<LocalVerificationState['history']>,
  entry: NonNullable<LocalVerificationState['history']>[number]
): NonNullable<LocalVerificationState['history']> {
  return [...history, entry].slice(-20);
}

function previousRunEntry(state: LocalVerificationState): NonNullable<LocalVerificationState['history']>[number] {
  const previousStatus = state.state === 'failed' || state.state === 'cancelled' || state.state === 'stale'
    ? state.state
    : 'stale';
  return {
    runId: state.runId,
    state: previousStatus,
    finishedAt: state.finishedAt ?? new Date().toISOString(),
    reason: state.reason ?? 'previous run state was incomplete'
  };
}

function launchWorker(
  paths: Paths,
  current: LocalVerificationFingerprint,
  history: NonNullable<LocalVerificationState['history']>
): string {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const logPath = path.join(paths.directory, `${runId}.log`);
  writeState(paths, { schema: SCHEMA, runId, state: 'running', startedAt, logPath, history, fingerprint: current });
  const child = spawn(process.execPath, [VERIFY_SCRIPT, 'worker', runId], {
    cwd: paths.root,
    detached: true,
    env: verificationEnvironment(process.env),
    stdio: 'ignore',
    windowsHide: true
  });
  if (!child.pid) {
    writeState(paths, { schema: SCHEMA, runId, state: 'failed', startedAt, logPath, history, finishedAt: new Date().toISOString(), exitCode: 1, reason: 'worker process did not start', fingerprint: current });
    return 'failed';
  }
  writeState(paths, { schema: SCHEMA, runId, state: 'running', startedAt, pid: child.pid, logPath, history, fingerprint: current });
  child.unref();
  return 'running';
}

function workerOwnsState(paths: Paths, runId: string): boolean {
  const state = readState(paths);
  return state?.state === 'running' && state.runId === runId && state.pid === process.pid;
}

async function waitForWorkerState(paths: Paths, runId: string): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = readState(paths);
    if (state?.runId !== runId) return false;
    if (state.pid === process.pid) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

function finalizeRun(paths: Paths, runId: string, exitCode: number): void {
  withLock(paths, () => {
    const state = readState(paths);
    if (!state || state.runId !== runId || state.pid !== process.pid) return;
    const current = snapshot(paths);
    const finishedAt = new Date().toISOString();
    if (exitCode !== 0) {
      writeState(paths, { ...state, state: 'failed', finishedAt, exitCode, reason: 'verify:local:run failed' });
      return;
    }
    if (!fingerprintsMatch(state.fingerprint, current) || !isWorkingTreeClean(paths.root)) {
      writeState(paths, { ...state, state: 'stale', finishedAt, exitCode: 0, reason: 'subject or working tree changed during verification' });
      return;
    }
    const receipt: LocalVerificationReceipt = { schema: SCHEMA, state: 'verified', verifiedAt: finishedAt, fingerprint: current };
    atomicWrite(paths.receipt, receipt);
    writeState(paths, { ...state, state: 'verified', finishedAt, exitCode: 0 });
  });
}

function runVerification(paths: Paths, logPath: string): number {
  const logDescriptor = openSync(logPath, 'a', 0o600);
  try {
    try {
      const result = spawnSync('npm', ['run', 'verify:local:run'], {
        cwd: paths.root,
        env: verificationEnvironment(process.env),
        stdio: ['ignore', logDescriptor, logDescriptor]
      });
      return result.error || result.status === null ? 1 : result.status;
    } catch (error) {
      writeFileSync(logDescriptor, `\nVerification could not start: ${(error as Error).message}\n`);
      return 1;
    }
  } finally {
    closeSync(logDescriptor);
  }
}

async function runWorker(paths: Paths, runId: string): Promise<void> {
  if (!await waitForWorkerState(paths, runId) || !workerOwnsState(paths, runId)) return;
  const state = readState(paths);
  const exitCode = runVerification(paths, state?.logPath ?? path.join(paths.directory, `${runId}.log`));
  finalizeRun(paths, runId, exitCode);
}

async function verifySynchronously(paths: Paths): Promise<number> {
  for (;;) {
    const current = snapshot(paths);
    if (isReusableReceipt(readReceipt(paths), current, isWorkingTreeClean(paths.root))) {
      console.log(`archimate-js: reused exact-head local verification receipt (${current.sha}).`);
      return 0;
    }
    const state = readState(paths);
    if (shouldReuseRunningRun(state, current) && state?.pid && processIsAlive(state.pid)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    const result = withLock(paths, () => runSynchronousUnderLock(paths));
    if (result === -1) continue;
    return result;
  }
}

function runSynchronousUnderLock(paths: Paths): number {
  const current = snapshot(paths);
  if (isReusableReceipt(readReceipt(paths), current, isWorkingTreeClean(paths.root))) return 0;
  const previous = readState(paths);
  if (shouldReuseRunningRun(previous, current) && previous?.pid && processIsAlive(previous.pid)) return -1;
  let history = previous?.history ?? [];
  if (previous?.state === 'running' && previous.pid) {
    if (!terminateRunProcess(previous.pid, previous.runId)) {
      throw new Error('Could not safely terminate the superseded verification process tree.');
    }
    history = appendHistory(history, { runId: previous.runId, state: 'cancelled', finishedAt: new Date().toISOString(), reason: 'replaced by synchronous verification' });
  } else if (previous && previous.state !== 'verified') {
    history = appendHistory(history, previousRunEntry(previous));
  }
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const logPath = path.join(paths.directory, `${runId}.log`);
  const running: LocalVerificationState = { schema: SCHEMA, runId, state: 'running', startedAt, pid: process.pid, logPath, history, fingerprint: current };
  writeState(paths, running);
  const exitCode = runVerification(paths, logPath);
  const after = snapshot(paths);
  const finishedAt = new Date().toISOString();
  if (exitCode !== 0) {
    writeState(paths, { ...running, state: 'failed', finishedAt, exitCode, reason: 'verify:local:run failed' });
    return exitCode;
  }
  if (!fingerprintsMatch(current, after)) {
    writeState(paths, { ...running, state: 'stale', finishedAt, exitCode: 0, reason: 'subject or working tree changed during verification' });
    console.error('archimate-js: HEAD, environment, or working tree changed during verification; no receipt was issued.');
    return 1;
  }
  if (!isWorkingTreeClean(paths.root)) {
    writeState(paths, { ...running, state: 'stale', finishedAt, exitCode: 0, reason: 'working tree is dirty; result was not cached' });
    console.log('archimate-js: local verification passed for the working tree; no reusable receipt was issued because it is dirty.');
    return 0;
  }
  atomicWrite(paths.receipt, { schema: SCHEMA, state: 'verified', verifiedAt: finishedAt, fingerprint: after } satisfies LocalVerificationReceipt);
  writeState(paths, { ...running, state: 'verified', finishedAt, exitCode: 0 });
  return 0;
}

function printStatus(paths: Paths): void {
  const current = snapshot(paths);
  const state = readState(paths);
  const receipt = readReceipt(paths);
  const status = statusFor(paths, current);
  console.log(JSON.stringify({
    status,
    subject: current.sha,
    branch: current.branch,
    profile: current.profile,
    state: state?.state ?? null,
    receiptAt: receipt?.verifiedAt ?? null,
    logPath: state?.logPath ?? null,
    history: state?.history ?? []
  }, null, 2));
}

function triggerBackground(paths: Paths): void {
  try {
    const child = spawn(process.execPath, [VERIFY_SCRIPT, 'start'], {
      cwd: paths.root,
      detached: true,
      env: verificationEnvironment(process.env),
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  } catch (error) {
    console.error(`archimate-js: could not start background verification: ${(error as Error).message}`);
  }
}

function main(): void {
  const paths = resolvePaths();
  const command = process.argv[2];
  if (command === 'trigger') return triggerBackground(paths);
  if (command === 'start') {
    console.log(`archimate-js: local verification ${startBackground(paths)}.`);
    return;
  }
  if (command === 'status') return printStatus(paths);
  if (command === 'worker') {
    const runId = process.argv[3];
    if (!runId) throw new Error('worker run ID is required');
    void runWorker(paths, runId).catch((error: unknown) => {
      console.error(`archimate-js: background verification failed: ${(error as Error).message}`);
      process.exitCode = 1;
    });
    return;
  }
  if (command === 'ensure') {
    void verifySynchronously(paths).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
      console.error(`archimate-js: local verification failed: ${(error as Error).message}`);
      process.exitCode = 1;
    });
    return;
  }
  throw new Error('Use trigger, start, status, worker, or ensure.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === VERIFY_SCRIPT) main();
