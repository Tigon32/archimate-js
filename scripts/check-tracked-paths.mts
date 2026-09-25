import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePublicSourceExceptions, type PublicSourceException } from './check-public-source-exceptions.mts';

type ManifestEntry = { path?: unknown; classification?: unknown };
type Finding = { rule: string; outcome?: 'reviewed' };

const FORBIDDEN_COMPONENTS = new Set([
  'private', 'customer', 'customers', 'customer-exports', 'spec', 'catalog',
  'browser-profile', 'browser-profiles', 'sessions', 'prompt-dumps',
  'transcripts', 'dumps'
]);
const MODEL_OR_MEDIA = /\.(?:archimate\d*|xml|png|jpe?g|webp|gif|bmp|tiff?|pdf|zip)$/i;
const SENSITIVE_DUMP = /(?:^|[-_.])(?:session|prompt|transcript|customer-export)(?:[-_.][^-_.]+)*\.(?:log|txt|jsonl?|har|zip|md)$/i;
const FIXTURE_ROOT = 'test/fixtures/';
const RESEARCH_ROOT = 'docs/research/';

export function readTrackedPaths(root: string): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' });
  return output.subarray(0, output.length - 1).toString('utf8').split('\0').filter(Boolean);
}

export function readTrackedSymlinkPaths(root: string): Set<string> {
  const output = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root, encoding: 'buffer' });
  const links = new Set<string>();
  for (const entry of output.toString('utf8').split('\0').filter(Boolean)) {
    const separator = entry.indexOf('\t');
    if (separator < 0 || entry.slice(0, separator).split(' ')[0] !== '120000') continue;
    links.add(entry.slice(separator + 1));
  }
  return links;
}

function addMarkdownLinks(inventory: Set<string>, sourcePath: string, text: string): void {
  const directory = sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1);
  for (const match of text.matchAll(/\]\(([^)#?]+)(?:[?#][^)]*)?\)/g)) {
    const target = match[1];
    if (!target || target.includes(':') || target.startsWith('/')) continue;
    const parts = [...directory.split('/'), ...target.split('/')];
    const normalized: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') { normalized.pop(); continue; }
      normalized.push(part);
    }
    inventory.add(normalized.join('/'));
  }
}

export function readResearchInventory(root: string): Set<string> {
  const inventory = new Set([`${RESEARCH_ROOT}README.md`, `${RESEARCH_ROOT}sources.yaml`, `${RESEARCH_ROOT}okf/index.md`]);
  const readmePath = resolve(root, `${RESEARCH_ROOT}README.md`);
  const okfIndexPath = resolve(root, `${RESEARCH_ROOT}okf/index.md`);
  addMarkdownLinks(inventory, `${RESEARCH_ROOT}README.md`, readFileSync(readmePath, 'utf8'));
  addMarkdownLinks(inventory, `${RESEARCH_ROOT}okf/index.md`, readFileSync(okfIndexPath, 'utf8'));
  return inventory;
}

function exceptionOutcome(path: string, finding: PublicSourceException['finding'], exceptions: readonly PublicSourceException[],
  forbidden: boolean, symlink: boolean, usedExceptions: Set<PublicSourceException>): Finding | undefined {
  const exception = exceptions.find((entry) => entry.path === path && entry.finding === finding);
  if (!exception) return undefined;
  if (forbidden || symlink || path.startsWith(FIXTURE_ROOT)) return undefined;
  usedExceptions.add(exception);
  return { rule: finding, outcome: 'reviewed' };
}

export function scanTrackedPaths(paths: readonly string[], manifest: readonly ManifestEntry[],
  exceptions: readonly PublicSourceException[] = [], symlinks: ReadonlySet<string> = new Set(),
  researchInventory: ReadonlySet<string> = new Set(), usedExceptions = new Set<PublicSourceException>()): Finding[] {
  const inventoried = new Set(manifest.filter((entry) =>
    (entry.classification === 'PUBLIC' || entry.classification === 'SYNTHETIC') &&
    typeof entry.path === 'string' && entry.path.startsWith(FIXTURE_ROOT)
  ).map((entry) => entry.path));
  const findings: Finding[] = [];
  for (const path of paths) {
    const components = path.toLowerCase().split('/');
    const forbidden = components.some((part) => FORBIDDEN_COMPONENTS.has(part)) ||
      SENSITIVE_DUMP.test(components.at(-1) ?? '');
    if (forbidden) {
      findings.push({ rule: 'forbidden-tracked-path' });
    }
    const symlink = symlinks.has(path);
    if (symlink && (path.startsWith(FIXTURE_ROOT) || path.startsWith(RESEARCH_ROOT) || MODEL_OR_MEDIA.test(path))) {
      findings.push({ rule: 'symlink-not-allowed' });
    }
    if (path.startsWith(FIXTURE_ROOT) && !['README.md', 'manifest.json'].includes(path.slice(FIXTURE_ROOT.length)) &&
        !inventoried.has(path)) {
      findings.push({ rule: 'unmanifested-fixture' });
    }
    if (path.startsWith(RESEARCH_ROOT) && !researchInventory.has(path)) {
      const reviewed = exceptionOutcome(path, 'unmanifested-research-artifact', exceptions, forbidden, symlink, usedExceptions);
      findings.push(reviewed ?? { rule: 'unmanifested-research-artifact' });
    } else if (MODEL_OR_MEDIA.test(path) && !inventoried.has(path) && !path.startsWith(FIXTURE_ROOT)) {
      const reviewed = exceptionOutcome(path, 'unmanifested-model-or-media', exceptions, forbidden, symlink, usedExceptions);
      findings.push(reviewed ?? { rule: 'unmanifested-model-or-media' });
    }
  }
  return findings;
}

export function formatFindings(findings: readonly Finding[]): string {
  const counts = new Map<string, number>();
  for (const { rule, outcome } of findings) {
    const label = outcome === 'reviewed' ? `reviewed-${rule}` : rule;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, count]) => `${rule}: ${count}`).join('\n');
}

export function checkTrackedPaths(root = process.cwd(), today = new Date().toISOString().slice(0, 10)): Finding[] {
  const manifestPath = resolve(root, 'test/fixtures/manifest.json');
  const exceptionsPath = resolve(root, 'docs/security/public-source-exceptions.json');
  try {
    if (!lstatSync(manifestPath).isFile() || lstatSync(manifestPath).isSymbolicLink()) {
      return [{ rule: 'fixture-manifest-invalid' }];
    }
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest)) return [{ rule: 'fixture-manifest-invalid' }];
    const exceptionPolicy: unknown = JSON.parse(readFileSync(exceptionsPath, 'utf8'));
    if (validatePublicSourceExceptions(exceptionPolicy, today).length) {
      return [{ rule: 'public-source-exception-policy-invalid' }];
    }
    const exceptions = (exceptionPolicy as { exceptions: PublicSourceException[] }).exceptions;
    const paths = readTrackedPaths(root);
    const usedExceptions = new Set<PublicSourceException>();
    const findings = scanTrackedPaths(paths, manifest, exceptions, readTrackedSymlinkPaths(root),
      readResearchInventory(root), usedExceptions);
    const unused = exceptions.filter((exception) => !usedExceptions.has(exception));
    return unused.length ? [...findings, ...unused.map(() => ({ rule: 'stale-public-source-exception' }))] : findings;
  } catch {
    return [{ rule: 'tracked-path-scan-failed' }];
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const findings = checkTrackedPaths();
  const failures = findings.filter((finding) => finding.outcome !== 'reviewed');
  const reviewedCount = findings.length - failures.length;
  if (failures.length) {
    process.stderr.write(`Tracked-path provenance check failed:\n${formatFindings(findings)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Tracked-path provenance check passed${reviewedCount ? ` with ${reviewedCount} reviewed exception(s)` : ''}.\n`);
  }
}
