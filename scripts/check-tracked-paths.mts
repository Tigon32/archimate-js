import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ManifestEntry = { path?: unknown; classification?: unknown };
type Finding = { rule: string };

const FORBIDDEN_COMPONENTS = new Set([
  'private', 'customer', 'customers', 'customer-exports', 'spec', 'catalog',
  'browser-profile', 'browser-profiles', 'sessions', 'prompt-dumps',
  'transcripts', 'dumps'
]);
const MODEL_OR_MEDIA = /\.(?:archimate\d*|xml|png|jpe?g|webp|gif|bmp|tiff?|pdf|zip)$/i;
const SENSITIVE_DUMP = /(?:^|[-_.])(?:session|prompt|transcript|customer-export)(?:[-_.][^.]+)*\.(?:log|txt|jsonl?|har|zip|md)$/i;

export function readTrackedPaths(root: string): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' });
  return output.subarray(0, output.length - 1).toString('utf8').split('\0').filter(Boolean);
}

export function scanTrackedPaths(paths: readonly string[], manifest: readonly ManifestEntry[]): Finding[] {
  const inventoried = new Set(manifest.filter((entry) =>
    (entry.classification === 'PUBLIC' || entry.classification === 'SYNTHETIC') &&
    typeof entry.path === 'string' && entry.path.startsWith('test/fixtures/')
  ).map((entry) => entry.path));
  const findings: Finding[] = [];
  for (const path of paths) {
    const components = path.toLowerCase().split('/');
    if (components.some((part) => FORBIDDEN_COMPONENTS.has(part)) ||
        SENSITIVE_DUMP.test(components.at(-1) ?? '')) {
      findings.push({ rule: 'forbidden-tracked-path' });
    }
    if (MODEL_OR_MEDIA.test(path) && !inventoried.has(path)) {
      findings.push({ rule: 'unmanifested-model-or-media' });
    }
  }
  return findings;
}

export function formatFindings(findings: readonly Finding[]): string {
  const counts = new Map<string, number>();
  for (const { rule } of findings) counts.set(rule, (counts.get(rule) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, count]) => `${rule}: ${count}`).join('\n');
}

export function checkTrackedPaths(root = process.cwd()): Finding[] {
  const manifestPath = resolve(root, 'test/fixtures/manifest.json');
  try {
    if (!lstatSync(manifestPath).isFile() || lstatSync(manifestPath).isSymbolicLink()) {
      return [{ rule: 'fixture-manifest-invalid' }];
    }
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest)) return [{ rule: 'fixture-manifest-invalid' }];
    return scanTrackedPaths(readTrackedPaths(root), manifest);
  } catch {
    return [{ rule: 'tracked-path-scan-failed' }];
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const findings = checkTrackedPaths();
  if (findings.length) {
    process.stderr.write(`Tracked-path provenance check failed:\n${formatFindings(findings)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Tracked-path provenance check passed.\n');
  }
}
