import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatFindings, scanFixtureContent, scanFixtureTree } from '../security/scan-fixtures.mjs';

describe('public fixture safety patterns', () => {
  it('allows the existing public standards namespace and synthetic names', () => {
    expect(scanFixtureContent([
      'xmlns:archimate="http://www.opengroup.org/xsd/archimate/3.0/"',
      'name="Synthetic Minimal Application View"',
      'id="application-component-1"'
    ].join('\n'), [])).toEqual([]);
  });

  it('detects common private data without returning matched content', () => {
    const findings = scanFixtureContent([
      'contact: sample.person@example.invalid',
      'endpoint=https://service.internal',
      'address=192.168.10.12',
      'password=example-only-value',
      'account is Example Program'
    ].join('\n'), [/Example Program/i]);

    expect(findings.map(finding => finding.rule)).toEqual([
      'email',
      'private-hostname',
      'private-ipv4',
      'secret-like-value',
      'configured-private-term'
    ]);
    expect(findings.every(finding => !('value' in finding))).toBe(true);
  });

  it('recognizes private, loopback, and link-local IPv4 ranges', () => {
    expect(scanFixtureContent('10.0.0.1\n172.20.1.2\n169.254.3.4\n8.8.8.8', [])).toEqual([
      { rule: 'private-ipv4', line: 1 },
      { rule: 'private-ipv4', line: 2 },
      { rule: 'private-ipv4', line: 3 }
    ]);
  });

  it('returns and formats findings without paths or configured terms', () => {
    const root = mkdtempSync(join(tmpdir(), 'fixture-scan-'));
    const fixtureDirectory = join(root, 'synthetic');
    mkdirSync(fixtureDirectory);
    writeFileSync(join(fixtureDirectory, 'model.xml'), '<Model name="Example Program"/>');
    writeFileSync(join(root, 'manifest.json'), JSON.stringify([{
      id: 'synthetic-sample',
      path: 'test/fixtures/synthetic/model.xml',
      classification: 'SYNTHETIC',
      purpose: 'redaction regression',
      provenance: 'hand-authored synthetic test data',
      contains_private_data: false,
      expected_coverage: ['redaction'],
      review_after: '2099-01-01'
    }]));

    try {
      const findings = scanFixtureTree(root, [/Example Program/i]);
      const output = formatFindings(findings);

      expect(findings).toContainEqual(expect.objectContaining({ rule: 'configured-private-term' }));
      expect(findings.every(finding => !('file' in finding) && !('path' in finding))).toBe(true);
      expect(JSON.stringify(findings)).not.toContain('Example Program');
      expect(output).not.toContain('Example Program');
      expect(output).not.toContain('model.xml');
      expect(output).not.toContain(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
