// SYNTHETIC provenance: inline ADR records exercise registry policy rules only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkAdrRegistry, type AdrRegistryFile } from '../../scripts/check-adr-registry.mts';

const readme = `# Architecture decision records

## ADR index

| ADR | Title | Status |
|---|---|---|
| 0001 | First synthetic ADR | Proposed |
| 0002 | Second synthetic ADR | Proposed |
`;

function adr(number: string, slug: string, title = `Synthetic ${number}`): AdrRegistryFile {
  return {
    name: `${number}-${slug}.md`,
    content: `---\ntitle: "ADR-${number}: ${title}"\n---\n\n# ADR-${number}: ${title}\n\nSYNTHETIC content.\n`
  };
}

function rules(files: AdrRegistryFile[], index = readme) {
  return checkAdrRegistry(files, index).map((finding) => finding.rule);
}

test('passes a contiguous synthetic ADR registry with one index row per file', () => {
  assert.deepEqual(checkAdrRegistry([adr('0001', 'first'), adr('0002', 'second')], readme), []);
});

test('rejects duplicate ADR numbers', () => {
  const oneRow = readme.replace(/\| 0002 .+\n/, '');
  assert.deepEqual(rules([adr('0001', 'first'), adr('0001', 'duplicate')], oneRow), ['adr-registry/duplicate-number']);
});

test('rejects filenames outside the four-digit slug policy', () => {
  assert(rules([{ name: '1-bad.md', content: '# ADR-0001: Bad\n' }]).includes('adr-registry/bad-filename'));
});

test('rejects gaps in the ADR number sequence', () => {
  assert(rules([adr('0001', 'first'), adr('0003', 'third')], readme.replace('0002', '0003')).includes('adr-registry/gap'));
});

test('rejects front-matter and H1 ADR number mismatches', () => {
  assert.deepEqual(rules([{
    name: '0001-first.md',
    content: '---\ntitle: "ADR-0002: Wrong"\n---\n\n# ADR-0003: Wrong\n'
  }], readme.replace(/\| 0002 .+\n/, '')), [
    'adr-registry/title-mismatch',
    'adr-registry/title-mismatch'
  ]);
});

test('rejects missing README index rows', () => {
  assert(rules([adr('0001', 'first')], readme.replace(/\| 0001 .+\n/, '')).includes('adr-registry/index-missing'));
});

test('rejects duplicate README index rows', () => {
  const duplicated = `${readme}| 0001 | Duplicate synthetic ADR | Proposed |\n`;
  assert(rules([adr('0001', 'first'), adr('0002', 'second')], duplicated).includes('adr-registry/index-duplicate'));
});

test('rejects README index rows with no ADR file', () => {
  const orphaned = `${readme}| 0003 | Orphan synthetic ADR | Proposed |\n`;
  assert(rules([adr('0001', 'first'), adr('0002', 'second')], orphaned).includes('adr-registry/index-orphan'));
});
