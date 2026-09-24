import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export type SecretFinding = { rule: string };

const RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'private-key-header', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ }
];

function markers(raw: string): string[] {
  return raw.split(/[\r\n,]+/).map(value => value.trim()).filter(Boolean);
}

export function scanSecretText(content: string, configuredMarkers: readonly string[] = []): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const line of content.split(/\r?\n/)) {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) findings.push({ rule: rule.id });
    }
    if (configuredMarkers.some(marker => line.includes(marker))) findings.push({ rule: 'configured-marker' });
  }
  return findings;
}

function trackedPaths(root: string): string[] {
  const output = execFileSync('git', ['ls-files', '--cached', '-z'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  });
  return output.split('\0').filter(Boolean).sort();
}

function hasSymlinkComponent(root: string, name: string): boolean {
  let current = root;
  for (const component of name.split('/')) {
    current = resolve(current, component);
    if (lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

export function scanTrackedText(root: string, configuredMarkers: readonly string[] = []): {
  findings: SecretFinding[]; scanned: number; skippedBinary: number;
} {
  const findings: SecretFinding[] = [];
  let scanned = 0;
  let skippedBinary = 0;
  for (const name of trackedPaths(root)) {
    const path = resolve(root, name);
    const fromRoot = relative(root, path);
    if (fromRoot.startsWith('..' + sep) || fromRoot === '..' || isAbsolute(fromRoot)) {
      findings.push({ rule: 'path-outside-checkout' });
      continue;
    }
    try {
      if (hasSymlinkComponent(root, name)) {
        findings.push({ rule: 'symlink-tracked-entry' });
        continue;
      }
      const handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      let bytes: Buffer;
      try {
        if (!fstatSync(handle).isFile()) {
          findings.push({ rule: 'nonregular-tracked-entry' });
          continue;
        }
        bytes = readFileSync(handle);
      } finally {
        closeSync(handle);
      }
      if (bytes.includes(0)) {
        skippedBinary++;
        continue;
      }
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        skippedBinary++;
        continue;
      }
      findings.push(...scanSecretText(content, configuredMarkers));
      scanned++;
    } catch {
      findings.push({ rule: 'unreadable-or-symlink-entry' });
    }
  }
  return { findings, scanned, skippedBinary };
}

function main(): void {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const result = scanTrackedText(root, markers(process.env.ARCHIMATE_SECRET_SCAN_MARKERS ?? ''));
    if (result.findings.length) {
      const counts = new Map<string, number>();
      for (const finding of result.findings) counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
      console.error('Secret scan failed. Rule counts only; paths and matched content omitted.');
      for (const [rule, count] of [...counts].sort()) console.error(`${rule}: ${count}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Secret scan passed: ${result.scanned} tracked text files checked; ${result.skippedBinary} binary files skipped.`);
  } catch {
    console.error('Secret scan could not complete; paths and content omitted.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
