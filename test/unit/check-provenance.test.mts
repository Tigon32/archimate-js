// @ts-expect-error Node types are not part of the browser package dependencies.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { tmpdir } from 'node:os';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error Provenance tooling stays plain ESM under scripts/ per ADR-0004's build-tooling exception.
import { checkFixtureContentHashes, checkOkfBundleProvenance, checkSourcesYamlProvenance, parseYamlDocument } from '../../scripts/check-provenance.mjs';

const VALID_SOURCE_ENTRY = [
  'sources:',
  '  - id: synthetic-source',
  '    title: Synthetic public reference',
  '    url: https://example.invalid/reference',
  '    license_or_terms: Link and summarize only.',
  '    retrieved_at: 2026-09-23',
  '    claims:',
  '      - A synthetic claim used only by this test.',
  '    review_after: 2099-01-01'
].join('\n');

const VALID_OKF_FRONTMATTER = [
  '---',
  'type: Reference',
  'title: Synthetic concept',
  'description: Synthetic OKF concept document used only by this test.',
  'resource: "https://example.invalid/synthetic"',
  'tags: [synthetic]',
  'retrieved_at: 2026-09-23T00:00:00Z',
  'authority: Synthetic authority note.',
  'license_or_terms: Link and summarize only.',
  'sources:',
  '  - id: synthetic-concept',
  '    resource: "https://example.invalid/synthetic"',
  '    title: Synthetic concept',
  '---',
  '',
  '# Synopsis'
].join('\n');

function withTempDir<T>(run: (root: string) => T): T {
  const root: string = mkdtempSync(join(tmpdir(), 'provenance-check-'));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('minimal YAML document parsing', () => {
  it('parses block sequences of maps, flow arrays, and quoted scalars', () => {
    const doc = parseYamlDocument(VALID_OKF_FRONTMATTER.split('\n').slice(1, -3).join('\n'));
    expect(doc.tags).toEqual(['synthetic']);
    expect(doc.sources).toEqual([{ id: 'synthetic-concept', resource: 'https://example.invalid/synthetic', title: 'Synthetic concept' }]);
  });

  it('rejects duplicate block and flow mapping keys', () => {
    expect(() => parseYamlDocument('source:\n  url: ftp://example.invalid\n  url: https://example.invalid'))
      .toThrow(/duplicate/i);
    expect(() => parseYamlDocument('source: { url: ftp://example.invalid, url: https://example.invalid }'))
      .toThrow(/duplicate/i);
  });
});

describe('research sources.yaml provenance', () => {
  it('passes for a well-formed synthetic entry', () => {
    withTempDir((root: string) => {
      const path = join(root, 'sources.yaml');
      writeFileSync(path, VALID_SOURCE_ENTRY);
      expect(checkSourcesYamlProvenance(path)).toEqual([]);
    });
  });

  it('flags missing fields, duplicate ids, and disallowed schemes', () => {
    withTempDir((root: string) => {
      const path = join(root, 'sources.yaml');
      writeFileSync(path, [
        'sources:',
        '  - id: dup',
        '    title: Missing other required fields',
        '  - id: dup',
        '    title: Duplicate id with a disallowed scheme',
        '    url: ftp://example.invalid/file',
        '    license_or_terms: none',
        '    retrieved_at: 2026-09-23',
        '    review_after: 2099-01-01'
      ].join('\n'));

      const rules = checkSourcesYamlProvenance(path).map((finding: { rule: string }) => finding.rule);
      expect(rules).toContain('source-entry-missing-field');
      expect(rules).toContain('source-entry-duplicate-id');
      expect(rules).toContain('source-entry-disallowed-scheme');
    });
  });

  it('fails closed when a source entry repeats a mapping key', () => {
    withTempDir((root: string) => {
      const path = join(root, 'sources.yaml');
      writeFileSync(path, `${VALID_SOURCE_ENTRY}\n    url: https://example.invalid/duplicate\n`);
      expect(checkSourcesYamlProvenance(path)).toEqual([{ rule: 'sources-yaml-unreadable' }]);
    });
  });
});

describe('OKF research bundle provenance', () => {
  it('passes for a well-formed synthetic concept document listed in the index', () => {
    withTempDir((root: string) => {
      writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n[Synthetic concept](synthetic.md)\n');
      writeFileSync(join(root, 'synthetic.md'), VALID_OKF_FRONTMATTER);
      expect(checkOkfBundleProvenance(root)).toEqual([]);
    });
  });

  it('flags missing frontmatter fields, disallowed schemes, and index drift', () => {
    withTempDir((root: string) => {
      writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n[Unlisted](missing.md)\n');
      writeFileSync(join(root, 'incomplete.md'), [
        '---',
        'type: Reference',
        'title: Incomplete',
        'resource: "not-a-url"',
        'sources:',
        '  - id: incomplete',
        '    resource: "not-a-url"',
        '---'
      ].join('\n'));

      const rules = checkOkfBundleProvenance(root).map((finding: { rule: string }) => finding.rule);
      expect(rules).toContain('okf-required-field-missing');
      expect(rules).toContain('okf-disallowed-scheme');
      expect(rules).toContain('okf-source-entry-invalid');
      expect(rules).toContain('okf-file-missing-from-index');
      expect(rules).toContain('okf-index-link-missing-file');
    });
  });
});

describe('fixture manifest content hashes', () => {
  it('passes when a recorded hash matches the fixture content', () => {
    withTempDir((root: string) => {
      writeFileSync(join(root, 'model.xml'), '<Model/>');
      const manifestPath = join(root, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify([{
        id: 'synthetic-hash-sample',
        path: 'test/fixtures/model.xml',
        content_sha256: 'd343b2d256893cb066785905d9d4a6b0e3960d26180ca5d0f08cea51ec3ae797'
      }]));
      expect(checkFixtureContentHashes(manifestPath, root)).toEqual([]);
    });
  });

  it('flags a mismatched recorded hash without echoing file content', () => {
    withTempDir((root: string) => {
      mkdirSync(join(root, 'nested'));
      writeFileSync(join(root, 'nested', 'model.xml'), '<Model name="changed"/>');
      const manifestPath = join(root, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify([{
        id: 'synthetic-hash-mismatch',
        path: 'test/fixtures/nested/model.xml',
        content_sha256: '0000000000000000000000000000000000000000000000000000000000000000'.slice(0, 64)
      }]));

      const findings = checkFixtureContentHashes(manifestPath, root);
      expect(findings).toEqual([{ rule: 'content-hash-mismatch', id: 'synthetic-hash-mismatch' }]);
      expect(JSON.stringify(findings)).not.toContain('changed');
    });
  });
});

describe('required fixture manifest hashes', () => {
  it('requires a hash for every manifest entry', () => {
    withTempDir((root: string) => {
      const manifestPath = join(root, 'manifest.json');
      writeFileSync(join(root, 'model.xml'), '<Model/>');
      writeFileSync(manifestPath, JSON.stringify([{ id: 'missing-hash', path: 'test/fixtures/model.xml' }]));
      expect(checkFixtureContentHashes(manifestPath, root)).toEqual([
        { rule: 'content-hash-missing', id: 'missing-hash' }
      ]);
    });
  });

  it('rejects uppercase, short, and non-string hash values before reading fixture bytes', () => {
    withTempDir((root: string) => {
      const manifestPath = join(root, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify([
        { id: 'uppercase-hash', path: 'test/fixtures/missing.xml', content_sha256: 'A'.repeat(64) },
        { id: 'short-hash', path: 'test/fixtures/missing.xml', content_sha256: 'a'.repeat(63) },
        { id: 'null-hash', path: 'test/fixtures/missing.xml', content_sha256: null }
      ]));
      expect(checkFixtureContentHashes(manifestPath, root)).toEqual([
        { rule: 'content-hash-invalid', id: 'uppercase-hash' },
        { rule: 'content-hash-invalid', id: 'short-hash' },
        { rule: 'content-hash-invalid', id: 'null-hash' }
      ]);
    });
  });
});
