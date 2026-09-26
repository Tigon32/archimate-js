import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ADR_FILE = /(?:^|\/)(\d{4})-[a-z0-9-]+\.md$/;

export type OpenPrAdrFiles = {
  number: number;
  headRefName: string;
  files: OpenPrAdrFile[];
};

export type OpenPrAdrFile = {
  path: string;
  changeType: string;
};

export type AdrCollisionInput = {
  added: AdrGitFile[];
  mainFiles: AdrGitFile[];
  openPrs: OpenPrAdrFiles[];
  selfPr?: number;
};

export type AdrGitFile = {
  path: string;
  blob: string;
};

export type Collision = {
  number: string;
  source: 'main' | `PR #${number}`;
  nextFree: string;
};

type FileNumber = {
  path: string;
  blob?: string;
  number: string;
};

function adrNumber(file: string) {
  return ADR_FILE.exec(file.replaceAll('\\', '/'))?.[1];
}

function adrEntries(files: AdrGitFile[]) {
  return files.flatMap((file) => {
    const number = adrNumber(file.path);
    return number ? [{ path: file.path, blob: file.blob, number }] : [];
  });
}

function addedOpenPrAdrEntries(files: OpenPrAdrFile[]) {
  return files.flatMap((file) => {
    const number = file.changeType === 'ADDED' ? adrNumber(file.path) : undefined;
    return number ? [{ path: file.path, number }] : [];
  });
}

function nextFreeNumber(mainFiles: AdrGitFile[], openPrs: OpenPrAdrFiles[]) {
  const allNumbers = [
    ...adrEntries(mainFiles),
    ...openPrs.flatMap((pr) => addedOpenPrAdrEntries(pr.files))
  ].map((entry) => Number(entry.number));
  return (Math.max(0, ...allNumbers) + 1).toString().padStart(4, '0');
}

function collidesWithMain(added: FileNumber, mainEntries: FileNumber[]) {
  return mainEntries.some((entry) => entry.number === added.number && (entry.path !== added.path || entry.blob !== added.blob));
}

function pushCollision(collisions: Collision[], number: string, source: Collision['source'], nextFree: string) {
  if (!collisions.some((collision) => collision.number === number && collision.source === source)) {
    collisions.push({ number, source, nextFree });
  }
}

export function findAdrCollisions(input: AdrCollisionInput): Collision[] {
  const addedEntries = adrEntries(input.added);
  const mainEntries = adrEntries(input.mainFiles);
  const nextFree = nextFreeNumber(input.mainFiles, input.openPrs);
  const collisions: Collision[] = [];

  for (const added of addedEntries) {
    if (collidesWithMain(added, mainEntries)) pushCollision(collisions, added.number, 'main', nextFree);
    for (const pr of input.openPrs) {
      if (pr.number === input.selfPr) continue;
      if (addedOpenPrAdrEntries(pr.files).some((entry) => entry.number === added.number)) {
        pushCollision(collisions, added.number, `PR #${pr.number}`, nextFree);
      }
    }
  }

  return collisions.sort((left, right) => left.number.localeCompare(right.number) || left.source.localeCompare(right.source));
}

function capture(command: string, args: string[]) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function noticeAndExit(message: string) {
  console.error(message);
  process.exitCode = process.env.CI === 'true' ? 1 : 0;
}

function ghAvailable() {
  return spawnSync('gh', ['--version'], { stdio: 'ignore' }).status === 0;
}

function tokenAvailable() {
  return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
}

function pathBlob(path: string) {
  return capture('git', ['rev-parse', `HEAD:${path}`]);
}

function addedAdrFiles(base: string): AdrGitFile[] {
  const output = capture('git', ['diff', '--name-status', '--diff-filter=A', `${base}...HEAD`, '--', 'docs/adr']);
  return output.split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(/\s+/).at(-1) ?? '')
    .filter(Boolean)
    .map((filePath) => ({ path: filePath, blob: pathBlob(filePath) }));
}

function mainAdrFiles(): AdrGitFile[] {
  const output = capture('git', ['ls-tree', '-r', 'origin/main', '--', 'docs/adr']);
  return output.split(/\r?\n/).flatMap((line) => {
    const match = /^(\d+)\s+\w+\s+([0-9a-f]{40,64})\t(.+)$/.exec(line);
    return match ? [{ path: match[3], blob: match[2] }] : [];
  });
}

function stringProperty(value: unknown, property: string) {
  return typeof value === 'object' && value !== null && property in value
    ? (value as Record<string, unknown>)[property]
    : undefined;
}

function filePath(value: unknown) {
  if (typeof value === 'string') return value;
  const pathValue = stringProperty(value, 'path');
  return typeof pathValue === 'string' ? pathValue : undefined;
}

function openPrFile(value: unknown): OpenPrAdrFile | undefined {
  const pathValue = filePath(value);
  if (!pathValue) return undefined;
  const changeType = stringProperty(value, 'changeType');
  return { path: pathValue, changeType: typeof changeType === 'string' ? changeType : '' };
}

function parseOpenPrs(text: string): OpenPrAdrFiles[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    const number = stringProperty(entry, 'number');
    const headRefName = stringProperty(entry, 'headRefName');
    const files = stringProperty(entry, 'files');
    if (typeof number !== 'number' || typeof headRefName !== 'string' || !Array.isArray(files)) return [];
    return [{ number, headRefName, files: files.map(openPrFile).filter((file): file is OpenPrAdrFile => Boolean(file)) }];
  });
}

function openPrs() {
  const output = capture('gh', ['pr', 'list', '--state', 'open', '--json', 'number,headRefName,files', '--limit', '100']);
  return parseOpenPrs(output);
}

export function formatAdrCollisions(collisions: Collision[]) {
  return collisions.map((collision) => `ADR-${collision.number} collides with ${collision.source}; next free number is ADR-${collision.nextFree}.`);
}

function main() {
  if (!ghAvailable()) {
    noticeAndExit('ADR collision check skipped: gh is unavailable. CI requires gh for open PR collision checks.');
    return;
  }
  if (!tokenAvailable()) {
    noticeAndExit('ADR collision check skipped: GH_TOKEN is unavailable. CI requires a read-only token.');
    return;
  }

  const collisions = findAdrCollisions({
    added: addedAdrFiles(process.env.ADR_BASE || 'origin/main'),
    mainFiles: mainAdrFiles(),
    openPrs: openPrs(),
    selfPr: process.env.ADR_SELF_PR ? Number(process.env.ADR_SELF_PR) : undefined
  });
  if (collisions.length) {
    console.error('ADR collision check failed:');
    formatAdrCollisions(collisions).forEach((collision) => console.error(`- ${collision}`));
    process.exitCode = 1;
    return;
  }
  console.log('ADR collision check passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
