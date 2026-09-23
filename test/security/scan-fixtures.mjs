import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ROOT = resolve(process.cwd(), 'test/fixtures');
const PRIVATE_HOST_SUFFIX = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:local|internal|intranet|corp|lan|home|private|test)\b/i;
const SINGLE_LABEL_URL = /\bhttps?:\/\/[a-z0-9_-]+(?=[:/])/i;
const PRIVATE_IPV6 = /(?:^|[^a-z0-9])(?:::1|fc[0-9a-f]{2}:[0-9a-f:]*|fd[0-9a-f]{2}:[0-9a-f:]*|fe80:[0-9a-f:]*)(?:$|[^a-z0-9])/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["']?[^\s"'<>]{8,}/i
];

function escapeRegExp(value) {
  return value.split('').map(character => {
    return '.*+?^$()|[]{}'.includes(character) || character === '\\' ? '\\' + character : character;
  }).join('');
}

function parseBlockedTerms(raw) {
  return String(raw || '')
    .split(/[\r\n,]+/)
    .map(term => term.trim())
    .filter(Boolean)
    .map(term => new RegExp('(?<![\\p{L}\\p{N}])' + escapeRegExp(term) + '(?![\\p{L}\\p{N}])', 'iu'));
}

function isPrivateIPv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}

export function scanFixtureContent(content, blockedTerms = parseBlockedTerms(process.env.ARCHIMATE_FIXTURE_BLOCK_TERMS)) {
  const findings = [];

  content.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (EMAIL.test(line)) findings.push({ rule: 'email', line: lineNumber });
    if (PRIVATE_HOST_SUFFIX.test(line) || SINGLE_LABEL_URL.test(line)) {
      findings.push({ rule: 'private-hostname', line: lineNumber });
    }
    if (PRIVATE_IPV6.test(line)) findings.push({ rule: 'private-ipv6', line: lineNumber });
    if (SECRET_PATTERNS.some(pattern => pattern.test(line))) {
      findings.push({ rule: 'secret-like-value', line: lineNumber });
    }
    if ([...line.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)].some(match => isPrivateIPv4(match[0]))) {
      findings.push({ rule: 'private-ipv4', line: lineNumber });
    }
    if (blockedTerms.some(pattern => pattern.test(line))) {
      findings.push({ rule: 'configured-private-term', line: lineNumber });
    }
  });

  return findings;
}

function walkFiles(directory, root, records) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    const relativePath = relative(root, path).split(sep).join('/');

    if (entry.isSymbolicLink()) records.push({ file: relativePath, rule: 'symlink-not-allowed' });
    else if (entry.isDirectory()) walkFiles(path, root, records);
    else if (entry.isFile()) records.push({ file: relativePath, rule: 'scan-file' });
    else records.push({ file: relativePath, rule: 'unsupported-entry' });
  }
}

function validateManifest(root, files, findings) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
  } catch {
    findings.push({ rule: 'manifest-invalid' });
    return;
  }

  if (!Array.isArray(manifest)) {
    findings.push({ rule: 'manifest-invalid' });
    return;
  }

  const entriesByPath = new Map();
  const ids = new Set();
  for (const entry of manifest) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      findings.push({ rule: 'manifest-entry-invalid' });
      continue;
    }

    const required = ['id', 'path', 'classification', 'purpose', 'provenance', 'contains_private_data', 'expected_coverage', 'review_after'];
    if (required.some(key => !(key in entry))
      || typeof entry.id !== 'string'
      || typeof entry.path !== 'string'
      || typeof entry.purpose !== 'string'
      || typeof entry.provenance !== 'string'
      || !Array.isArray(entry.expected_coverage)
      || entry.contains_private_data !== false
      || !['SYNTHETIC', 'PUBLIC'].includes(entry.classification)) {
      findings.push({ rule: 'manifest-entry-invalid' });
      continue;
    }

    if (ids.has(entry.id) || entriesByPath.has(entry.path)) {
      findings.push({ rule: 'manifest-duplicate' });
      continue;
    }
    ids.add(entry.id);
    entriesByPath.set(entry.path, entry);

    const prefix = 'test/fixtures/';
    if (!entry.path.startsWith(prefix) || entry.path.slice(prefix.length).startsWith('../')) {
      findings.push({ rule: 'manifest-path-outside-fixtures' });
      continue;
    }

    const fixturePath = resolve(root, entry.path.slice(prefix.length));
    if (!fixturePath.startsWith(root + sep)) {
      findings.push({ rule: 'manifest-path-outside-fixtures' });
      continue;
    }
    try {
      if (!lstatSync(fixturePath).isFile()) findings.push({ rule: 'manifest-file-missing' });
    } catch {
      findings.push({ rule: 'manifest-file-missing' });
    }

    if (entry.classification === 'PUBLIC'
      && ['source', 'license', 'retrieved_on', 'allowed_use'].some(key => typeof entry[key] !== 'string' || !entry[key].trim())) {
      findings.push({ rule: 'public-provenance-incomplete' });
    }
  }

  const manifestedPaths = new Set(entriesByPath.keys());
  for (const file of files) {
    if (file === 'README.md' || file === 'manifest.json') continue;
    if (!manifestedPaths.has('test/fixtures/' + file)) findings.push({ rule: 'fixture-missing-from-manifest' });
  }
}

export function scanFixtureTree(root = DEFAULT_ROOT, blockedTerms = parseBlockedTerms(process.env.ARCHIMATE_FIXTURE_BLOCK_TERMS)) {
  const findings = [];
  const records = [];
  walkFiles(root, root, records);

  const orderedPaths = records.map(record => record.file).sort();
  const dataPaths = records.filter(record => record.rule === 'scan-file').map(record => record.file).sort();

  for (const record of records) {
    const fileIndex = orderedPaths.indexOf(record.file) + 1;
    if (record.rule !== 'scan-file') {
      findings.push({ rule: record.rule, fileIndex });
      continue;
    }

    let content;
    try {
      const bytes = readFileSync(resolve(root, record.file));
      if (bytes.includes(0)) {
        findings.push({ rule: 'binary-fixture-not-allowed', fileIndex });
        continue;
      }
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      findings.push({ rule: 'fixture-unreadable', fileIndex });
      continue;
    }

    for (const match of scanFixtureContent(content, blockedTerms)) {
      findings.push({ rule: match.rule, fileIndex, line: match.line });
    }
  }

  validateManifest(root, dataPaths, findings);
  return findings;
}

export function formatFindings(findings) {
  const redacted = findings.map(finding => {
    const location = finding.fileIndex ? 'fixture file ' + finding.fileIndex + (finding.line ? ', line ' + finding.line : '') + ': ' : '';
    return '- ' + location + finding.rule;
  });
  return 'Fixture safety scan failed with ' + findings.length + ' finding(s). File paths and matched content are intentionally omitted.\n' + redacted.join('\n');
}

function main() {
  const findings = scanFixtureTree();
  if (findings.length) {
    console.error(formatFindings(findings));
    process.exitCode = 1;
    return;
  }

  console.log('Fixture safety scan passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
