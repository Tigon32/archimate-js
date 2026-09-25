import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadMarkerRules, type MarkerRule } from './content-markers.mts';

export type FindingSeverity = 'failure' | 'review';
export type SecretFinding = { rule: string; severity: FindingSeverity; fileIndex?: number; lineClass?: string };

const RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'private-key-header', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ }
];

/** Scanner-boundary failures; every other rule is a redacted manual-review finding. */
const FAILURE_RULES = new Set([
  'path-outside-checkout', 'symlink-tracked-entry', 'nonregular-tracked-entry',
  'unreadable-or-symlink-entry', 'marker-config-invalid'
]);

const LINE_CLASS_SIZE = 50;

function severityOf(rule: string): FindingSeverity {
  return FAILURE_RULES.has(rule) ? 'failure' : 'review';
}

/** Buckets a line number so diagnostics locate a finding without echoing its line. */
export function lineClassOf(lineNumber: number): string {
  const start = Math.floor((lineNumber - 1) / LINE_CLASS_SIZE) * LINE_CLASS_SIZE + 1;
  return `${start}-${start + LINE_CLASS_SIZE - 1}`;
}

function markers(raw: string): string[] {
  return raw.split(/[\r\n,]+/).map(value => value.trim()).filter(Boolean);
}

function lineClassStart(lineClass: string | undefined): number {
  return lineClass ? Number.parseInt(lineClass.split('-')[0] ?? '0', 10) : 0;
}

/** Deterministic order, independent of filesystem or Git path ordering. */
export function sortFindings(findings: readonly SecretFinding[]): SecretFinding[] {
  return [...findings].sort((left, right) =>
    (left.severity === right.severity ? 0 : left.severity === 'failure' ? -1 : 1)
    || left.rule.localeCompare(right.rule)
    || (left.fileIndex ?? 0) - (right.fileIndex ?? 0)
    || lineClassStart(left.lineClass) - lineClassStart(right.lineClass));
}

export function scanSecretText(content: string, configuredMarkers: readonly string[] = [],
  markerRules: readonly MarkerRule[] = []): SecretFinding[] {
  const findings: SecretFinding[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const lineClass = lineClassOf(index + 1);
    for (const rule of RULES) {
      if (rule.pattern.test(line)) findings.push({ rule: rule.id, severity: 'review', lineClass });
    }
    markerRules.forEach((rule, index) => {
      if (rule.pattern.test(line)) findings.push({ rule: `marker-rule-${index + 1}`, severity: 'review', lineClass });
    });
    if (configuredMarkers.some(marker => line.includes(marker))) {
      findings.push({ rule: 'configured-marker', severity: 'review', lineClass });
    }
  });
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

function readTrackedBytes(root: string, name: string): Buffer | SecretFinding {
  const path = resolve(root, name);
  const fromRoot = relative(root, path);
  if (fromRoot.startsWith('..' + sep) || fromRoot === '..' || isAbsolute(fromRoot)) {
    return { rule: 'path-outside-checkout', severity: 'failure' };
  }
  try {
    if (hasSymlinkComponent(root, name)) return { rule: 'symlink-tracked-entry', severity: 'failure' };
    const handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!fstatSync(handle).isFile()) return { rule: 'nonregular-tracked-entry', severity: 'failure' };
      return readFileSync(handle);
    } finally {
      closeSync(handle);
    }
  } catch {
    return { rule: 'unreadable-or-symlink-entry', severity: 'failure' };
  }
}

function decodeText(bytes: Buffer): string | undefined {
  if (bytes.includes(0)) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Scans tracked content. `excluded` holds repository-relative paths whose
 * content defines the rules themselves, such as the marker configuration.
 */
export function scanTrackedText(root: string, configuredMarkers: readonly string[] = [],
  markerRules: readonly MarkerRule[] = [], excluded: ReadonlySet<string> = new Set()): {
  findings: SecretFinding[]; scanned: number; skippedBinary: number;
} {
  const findings: SecretFinding[] = [];
  let scanned = 0;
  let skippedBinary = 0;
  trackedPaths(root).forEach((name, index) => {
    const fileIndex = index + 1;
    if (excluded.has(name)) return;
    const bytes = readTrackedBytes(root, name);
    if (!Buffer.isBuffer(bytes)) {
      findings.push({ ...bytes, fileIndex });
      return;
    }
    const content = decodeText(bytes);
    if (content === undefined) {
      skippedBinary++;
      return;
    }
    for (const finding of scanSecretText(content, configuredMarkers, markerRules)) {
      findings.push({ ...finding, fileIndex });
    }
    scanned++;
  });
  return { findings: sortFindings(findings), scanned, skippedBinary };
}

function section(title: string, findings: readonly SecretFinding[]): string[] {
  if (!findings.length) return [];
  const lines = findings.map(finding => {
    const file = finding.fileIndex ? `tracked file ${finding.fileIndex}` : 'tracked content';
    const at = finding.lineClass ? `, lines ${finding.lineClass}` : '';
    return `- ${file}${at}: ${finding.rule}`;
  });
  return [`${title} (${findings.length}):`, ...lines];
}

/** Redacted report: rule ids, file indexes, and line classes only. */
export function formatFindings(findings: readonly SecretFinding[]): string {
  const sorted = sortFindings(findings);
  return [
    'Content scan failed. Paths, matched values, and file content are intentionally omitted.',
    ...section('Scanner failures', sorted.filter(finding => finding.severity === 'failure')),
    ...section('Manual-review findings', sorted.filter(finding => finding.severity === 'review'))
  ].join('\n');
}

function main(): void {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const config = loadMarkerRules(root);
    const excluded = new Set(config.path ? [relative(root, config.path).split(sep).join('/')] : []);
    const result = scanTrackedText(root, markers(process.env.ARCHIMATE_SECRET_SCAN_MARKERS ?? ''), config.rules, excluded);
    const findings = config.invalid
      ? [{ rule: 'marker-config-invalid', severity: 'failure' as const }, ...result.findings]
      : result.findings;
    if (findings.length) {
      console.error(formatFindings(findings));
      process.exitCode = 1;
      return;
    }
    console.log(`Content scan passed: ${result.scanned} tracked text files checked; `
      + `${result.skippedBinary} binary files skipped; ${config.rules.length} marker rule(s) applied.`);
  } catch {
    console.error('Content scan could not complete; paths and content omitted.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
