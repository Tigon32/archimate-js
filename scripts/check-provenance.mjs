import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { formatFindings, scanFixtureTree } from '../test/security/scan-fixtures.mjs';

// Minimal deterministic parser for the two-space block-YAML shapes actually
// used by docs/research/sources.yaml and the docs/research/okf/*.md
// frontmatter (scalars, quoted scalars, flow arrays/objects, and block
// sequences of scalars or maps). It is intentionally not a general YAML
// parser; unsupported shapes are treated as parse failures upstream.

function stripQuotes(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const quoted = trimmed.length >= 2 && (first === '"' || first === "'") && last === first;
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

function splitFlowEntries(inner) {
  const entries = [];
  let depth = 0;
  let current = '';
  let quote = null;
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === '\'') { quote = char; current += char; continue; }
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) { entries.push(current); current = ''; continue; }
    current += char;
  }
  if (current.trim()) entries.push(current);
  return entries;
}

function parseScalarOrFlow(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return splitFlowEntries(trimmed.slice(1, -1)).map(entry => parseScalarOrFlow(entry)).filter(Boolean);
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const object = {};
    for (const entry of splitFlowEntries(trimmed.slice(1, -1))) {
      const separator = entry.indexOf(':');
      if (separator === -1) throw new Error('Unsupported flow mapping entry');
      const key = entry.slice(0, separator).trim();
      assignUnique(object, key, parseScalarOrFlow(entry.slice(separator + 1)));
    }
    return object;
  }
  return stripQuotes(trimmed);
}

function assignUnique(object, key, value) {
  if (!key || Object.prototype.hasOwnProperty.call(object, key)) {
    throw new Error('Duplicate or empty YAML mapping key');
  }
  object[key] = value;
}

function toEntries(text) {
  return text.split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map(line => ({ indent: line.length - line.trimStart().length, text: line.trim() }));
}

function splitKeyValue(text) {
  const separator = text.indexOf(':');
  return separator === -1 ? null : { key: text.slice(0, separator).trim(), rest: text.slice(separator + 1).trim() };
}

function parseBlock(entries, start, indent) {
  if (start >= entries.length || entries[start].indent !== indent) return { value: null, next: start };
  const isSequenceItem = entries[start].text.startsWith('- ') || entries[start].text === '-';
  return isSequenceItem ? parseSequence(entries, start, indent) : parseMapping(entries, start, indent);
}

function parseSequenceItem(entries, index, indent) {
  const inline = entries[index].text.replace(/^-\s?/, '');
  if (!inline) {
    const nested = parseBlock(entries, index + 1, entries[index + 1]?.indent);
    return { item: nested.value, next: nested.next };
  }
  const pair = splitKeyValue(inline);
  if (!pair) return { item: parseScalarOrFlow(inline), next: index + 1 };

  const itemIndent = entries[index].text.length - inline.length + indent;
  const item = {};
  const next = fillMappingItem(item, pair, entries, index, itemIndent);
  return { item, next };
}

function parseSequence(entries, start, indent) {
  const items = [];
  let index = start;
  while (index < entries.length && entries[index].indent === indent
    && (entries[index].text.startsWith('- ') || entries[index].text === '-')) {
    const { item, next } = parseSequenceItem(entries, index, indent);
    items.push(item);
    index = next;
  }
  return { value: items, next: index };
}

function fillMappingItem(item, firstPair, entries, index, itemIndent) {
  let cursor = index;
  let pair = firstPair;
  for (;;) {
    if (!pair.rest) {
      const nested = parseBlock(entries, cursor + 1, entries[cursor + 1]?.indent);
      assignUnique(item, pair.key, nested.value);
      cursor = nested.next;
    } else {
      assignUnique(item, pair.key, parseScalarOrFlow(pair.rest));
      cursor += 1;
    }
    if (cursor >= entries.length || entries[cursor].indent !== itemIndent) return cursor;
    pair = splitKeyValue(entries[cursor].text);
    if (!pair) return cursor;
  }
}

function parseMapping(entries, start, indent) {
  const object = {};
  let index = start;
  while (index < entries.length && entries[index].indent === indent) {
    const pair = splitKeyValue(entries[index].text);
    if (!pair) { index += 1; continue; }
    if (!pair.rest) {
      const nested = parseBlock(entries, index + 1, entries[index + 1]?.indent);
      assignUnique(object, pair.key, nested.value);
      index = nested.next;
    } else {
      assignUnique(object, pair.key, parseScalarOrFlow(pair.rest));
      index += 1;
    }
  }
  return { value: object, next: index };
}

export function parseYamlDocument(text) {
  const entries = toEntries(text);
  return entries.length ? parseMapping(entries, 0, entries[0].indent).value : {};
}

function isAllowedScheme(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function requiredStringFields(record, fields) {
  return fields.some(field => typeof record[field] !== 'string' || !record[field].trim());
}

// --- Fixture manifest content hashes -----------------------------------
//
// Reuses test/fixtures/manifest.json (the existing fixture inventory,
// already schema-validated by scanFixtureTree) and requires byte hashes
// that scanFixtureTree does not verify.

function isRegularFixturePath(fixturesRoot, fixturePath) {
  let current = fixturesRoot;
  for (const component of relative(fixturesRoot, fixturePath).split(sep)) {
    current = resolve(current, component);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return false;
    if (current === fixturePath ? !stat.isFile() : !stat.isDirectory()) return false;
  }
  return true;
}

export function checkFixtureContentHashes(manifestPath, fixturesRoot) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(manifest)) return [];

  const findings = [];
  const prefix = 'test/fixtures/';
  for (const [index, entry] of manifest.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const finding = rule => ({ rule, manifestIndex: index + 1 });
    if (!Object.hasOwn(entry, 'content_sha256')) {
      findings.push(finding('content-hash-missing'));
      continue;
    }
    if (typeof entry.content_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.content_sha256)) {
      findings.push(finding('content-hash-invalid'));
      continue;
    }
    if (typeof entry.path !== 'string') continue; // existing manifest validator reports invalid entries
    if (!entry.path.startsWith(prefix)) continue;

    const fixturePath = resolve(fixturesRoot, entry.path.slice(prefix.length));
    if (!fixturePath.startsWith(fixturesRoot + sep)) {
      findings.push(finding('content-hash-path-invalid'));
      continue;
    }
    let content;
    try {
      // The fixture scanner reports symlinks and non-files. Never follow them here.
      if (!isRegularFixturePath(fixturesRoot, fixturePath)) continue;
      content = readFileSync(fixturePath);
    } catch {
      continue; // missing-file is already reported by scanFixtureTree
    }
    const digest = createHash('sha256').update(content).digest('hex');
    if (digest !== entry.content_sha256) {
      findings.push(finding('content-hash-mismatch'));
    }
  }
  return findings;
}

// --- Research inventory: docs/research/sources.yaml ---------------------

function validateSourceEntry(entry, ids) {
  if (!entry || typeof entry !== 'object') return [{ rule: 'source-entry-invalid' }];

  const findings = [];
  const required = ['id', 'title', 'url', 'license_or_terms', 'retrieved_at', 'review_after'];
  if (requiredStringFields(entry, required)) findings.push({ rule: 'source-entry-missing-field', id: entry.id });

  if (typeof entry.id === 'string' && entry.id) {
    if (ids.has(entry.id)) findings.push({ rule: 'source-entry-duplicate-id', id: entry.id });
    ids.add(entry.id);
  }
  if (typeof entry.url === 'string' && !isAllowedScheme(entry.url)) {
    findings.push({ rule: 'source-entry-disallowed-scheme', id: entry.id });
  }
  return findings;
}

export function checkSourcesYamlProvenance(sourcesYamlPath) {
  let document;
  try {
    document = parseYamlDocument(readFileSync(sourcesYamlPath, 'utf8'));
  } catch {
    return [{ rule: 'sources-yaml-unreadable' }];
  }

  const entries = Array.isArray(document.sources) ? document.sources : null;
  if (!entries) return [{ rule: 'sources-yaml-invalid' }];

  const ids = new Set();
  return entries.flatMap(entry => validateSourceEntry(entry, ids));
}

// --- Research inventory: docs/research/okf/*.md concept bundle ----------

function validateOkfSources(sources, file) {
  if (!Array.isArray(sources) || !sources.length) return [{ rule: 'okf-sources-missing', file }];

  const findings = [];
  const ids = new Set();
  for (const source of sources) {
    const valid = source && typeof source.id === 'string' && source.id.trim()
      && typeof source.resource === 'string' && isAllowedScheme(source.resource);
    if (!valid) { findings.push({ rule: 'okf-source-entry-invalid', file }); continue; }
    if (ids.has(source.id)) findings.push({ rule: 'okf-source-duplicate-id', file, id: source.id });
    ids.add(source.id);
  }
  return findings;
}

function validateOkfDocument(okfDir, file) {
  const text = readFileSync(resolve(okfDir, file), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return [{ rule: 'okf-frontmatter-missing', file }];

  const doc = parseYamlDocument(match[1]);
  const findings = [];
  const required = ['type', 'title', 'description', 'resource', 'retrieved_at', 'authority', 'license_or_terms'];
  if (requiredStringFields(doc, required)) findings.push({ rule: 'okf-required-field-missing', file });
  if (typeof doc.resource === 'string' && !isAllowedScheme(doc.resource)) {
    findings.push({ rule: 'okf-disallowed-scheme', file });
  }
  return [...findings, ...validateOkfSources(doc.sources, file)];
}

function validateOkfIndex(okfDir, files, conceptFiles) {
  if (!files.includes('index.md')) return [{ rule: 'okf-index-missing' }];

  const indexText = readFileSync(resolve(okfDir, 'index.md'), 'utf8');
  const linked = new Set([...indexText.matchAll(/]\(([\w-]+\.md)\)/g)].map(entry => entry[1]));
  const findings = [];
  for (const file of conceptFiles) if (!linked.has(file)) findings.push({ rule: 'okf-file-missing-from-index', file });
  for (const link of linked) if (!conceptFiles.includes(link)) findings.push({ rule: 'okf-index-link-missing-file', file: link });
  return findings;
}

export function checkOkfBundleProvenance(okfDir) {
  let entries;
  try {
    entries = readdirSync(okfDir, { withFileTypes: true });
  } catch {
    return [{ rule: 'okf-directory-unreadable' }];
  }

  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => entry.name).sort();
  const conceptFiles = files.filter(file => file !== 'index.md');
  const documentFindings = conceptFiles.flatMap(file => validateOkfDocument(okfDir, file));
  return [...documentFindings, ...validateOkfIndex(okfDir, files, conceptFiles)];
}

// --- Combined report ------------------------------------------------------

function defaultPaths(root = process.cwd()) {
  return {
    fixturesRoot: resolve(root, 'test/fixtures'),
    manifestPath: resolve(root, 'test/fixtures/manifest.json'),
    sourcesYamlPath: resolve(root, 'docs/research/sources.yaml'),
    okfDir: resolve(root, 'docs/research/okf')
  };
}

export function checkProvenance(paths = defaultPaths()) {
  const fixtures = [...scanFixtureTree(paths.fixturesRoot), ...checkFixtureContentHashes(paths.manifestPath, paths.fixturesRoot)];
  const research = [...checkSourcesYamlProvenance(paths.sourcesYamlPath), ...checkOkfBundleProvenance(paths.okfDir)];
  return { fixtures, research };
}

export function formatProvenanceReport({ fixtures, research }) {
  const sections = [];
  const fixtureScanFindings = fixtures.filter(finding => !finding.manifestIndex);
  const fixtureHashFindings = fixtures.filter(finding => finding.manifestIndex);
  if (fixtureScanFindings.length) sections.push(formatFindings(fixtureScanFindings));
  if (fixtureHashFindings.length) {
    sections.push('Fixture hash check failed with ' + fixtureHashFindings.length + ' finding(s):\n'
      + fixtureHashFindings.map(finding => '- fixture manifest entry ' + finding.manifestIndex + ': ' + finding.rule).join('\n'));
  }
  if (research.length) {
    const lines = research.map(finding => {
      const location = finding.file ? finding.file + ': ' : '';
      const suffix = finding.id ? ' (' + finding.id + ')' : '';
      return '- ' + location + finding.rule + suffix;
    });
    sections.push('Research provenance scan failed with ' + research.length + ' finding(s):\n' + lines.join('\n'));
  }
  return sections.join('\n\n');
}

function main() {
  const result = checkProvenance();
  if (result.fixtures.length || result.research.length) {
    console.error(formatProvenanceReport(result));
    process.exitCode = 1;
    return;
  }
  console.log('Provenance check passed for the fixture and research inventories.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
