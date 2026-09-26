import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ADR_FILENAME = /^(\d{4})-[a-z0-9-]+\.md$/;
const INDEX_ROW = /^\|\s*(\d{4})\s*\|/;

export type AdrRegistryRule =
  | 'adr-registry/duplicate-number'
  | 'adr-registry/bad-filename'
  | 'adr-registry/gap'
  | 'adr-registry/title-mismatch'
  | 'adr-registry/index-missing'
  | 'adr-registry/index-duplicate'
  | 'adr-registry/index-orphan';

export type AdrRegistryFile = {
  name: string;
  content: string;
};

export type Finding = {
  rule: AdrRegistryRule;
  subject: string;
  detail: string;
};

type NumberedFile = AdrRegistryFile & {
  number: string;
};

function addFinding(findings: Finding[], rule: AdrRegistryRule, subject: string, detail: string) {
  findings.push({ rule, subject, detail });
}

function normalizeName(name: string) {
  return name.replaceAll('\\', '/').split('/').at(-1) ?? name;
}

function parseAdrFile(file: AdrRegistryFile, findings: Finding[]) {
  const name = normalizeName(file.name);
  const match = ADR_FILENAME.exec(name);
  if (!match) {
    addFinding(findings, 'adr-registry/bad-filename', name, 'ADR filenames must match NNNN-slug.md.');
    return undefined;
  }
  return { name, content: file.content, number: match[1] } satisfies NumberedFile;
}

function frontMatterTitle(content: string) {
  if (!content.startsWith('---\n')) return undefined;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return undefined;
  const title = content.slice(4, end).match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return title?.[1];
}

function titleCarriesNumber(title: string | undefined, number: string) {
  return title === undefined || new RegExp(`\\bADR-${number}\\b`).test(title);
}

function checkTitles(file: NumberedFile, findings: Finding[]) {
  const title = frontMatterTitle(file.content);
  if (!titleCarriesNumber(title, file.number)) {
    addFinding(findings, 'adr-registry/title-mismatch', file.name, `front-matter title must carry ADR-${file.number}.`);
  }

  const heading = file.content.match(/^#\s+ADR-(\d{4}):/m);
  if (heading?.[1] !== file.number) {
    addFinding(findings, 'adr-registry/title-mismatch', file.name, `H1 must carry ADR-${file.number}.`);
  }
}

function checkDuplicates(files: NumberedFile[], findings: Finding[]) {
  const byNumber = new Map<string, string[]>();
  files.forEach((file) => byNumber.set(file.number, [...(byNumber.get(file.number) ?? []), file.name]));
  for (const [number, names] of byNumber) {
    if (names.length > 1) {
      addFinding(findings, 'adr-registry/duplicate-number', number, `ADR-${number} is used by ${names.join(', ')}.`);
    }
  }
}

function checkGaps(files: NumberedFile[], findings: Finding[]) {
  const present = new Set(files.map((file) => Number(file.number)));
  const maximum = Math.max(0, ...present);
  for (let expected = 1; expected <= maximum; expected += 1) {
    if (!present.has(expected)) {
      const number = expected.toString().padStart(4, '0');
      addFinding(findings, 'adr-registry/gap', number, `ADR-${number} is missing from the contiguous sequence.`);
    }
  }
}

function indexRows(readme: string) {
  const rows = new Map<string, number>();
  for (const line of readme.split(/\r?\n/)) {
    const match = INDEX_ROW.exec(line);
    if (match) rows.set(match[1], (rows.get(match[1]) ?? 0) + 1);
  }
  return rows;
}

function checkIndex(files: NumberedFile[], readme: string, findings: Finding[]) {
  const rows = indexRows(readme);
  const fileNumbers = new Set(files.map((file) => file.number));
  for (const file of files) {
    const count = rows.get(file.number) ?? 0;
    if (count === 0) addFinding(findings, 'adr-registry/index-missing', file.name, `ADR-${file.number} has no README row.`);
    if (count > 1) addFinding(findings, 'adr-registry/index-duplicate', file.number, `ADR-${file.number} has ${count} README rows.`);
  }
  for (const number of rows.keys()) {
    if (!fileNumbers.has(number)) {
      addFinding(findings, 'adr-registry/index-orphan', number, `ADR-${number} has a README row but no file.`);
    }
  }
}

function sortFindings(findings: Finding[]) {
  return findings.sort((left, right) => left.rule.localeCompare(right.rule)
    || left.subject.localeCompare(right.subject)
    || left.detail.localeCompare(right.detail));
}

export function checkAdrRegistry(files: AdrRegistryFile[], readme: string): Finding[] {
  const findings: Finding[] = [];
  const numberedFiles = files.map((file) => parseAdrFile(file, findings)).filter((file): file is NumberedFile => Boolean(file));
  numberedFiles.forEach((file) => checkTitles(file, findings));
  checkDuplicates(numberedFiles, findings);
  checkGaps(numberedFiles, findings);
  checkIndex(numberedFiles, readme, findings);
  return sortFindings(findings);
}

export function formatAdrRegistryFindings(findings: Finding[]) {
  return findings.map((finding) => `${finding.subject}: ${finding.rule}: ${finding.detail}`);
}

function readAdrRegistry(root: string) {
  const adrDir = path.join(root, 'docs', 'adr');
  const files = readdirSync(adrDir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => ({ name, content: readFileSync(path.join(adrDir, name), 'utf8') }));
  const readmePath = path.join(adrDir, 'README.md');
  const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '';
  return { files, readme };
}

function main() {
  const { files, readme } = readAdrRegistry(process.cwd());
  const findings = checkAdrRegistry(files, readme);
  if (findings.length) {
    console.error('ADR registry check failed:');
    formatAdrRegistryFindings(findings).forEach((finding) => console.error(`- ${finding}`));
    process.exitCode = 1;
    return;
  }
  console.log('ADR registry check passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
