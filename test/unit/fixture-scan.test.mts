// All canaries below are SYNTHETIC and assembled in memory so that tracked
// content never contains a literal private-data marker.
// @ts-expect-error Node types are not part of the browser package dependencies.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { tmpdir } from 'node:os';
// @ts-expect-error Node types are not part of the browser package dependencies.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatFindings, scanFixtureContent, scanFixtureTree } from '../security/scan-fixtures.mjs';

const privateHost = ['https://', 'service', '.', 'internal'].join('');
const privateAddress = (...octets: number[]) => octets.join('.');
const credentialAssignment = ['pass', 'word', '=', 'example-only-value'].join('');

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
      `endpoint=${privateHost}`,
      `address=${privateAddress(192, 168, 10, 12)}`,
      `${credentialAssignment}`,
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
    const content = [
      privateAddress(10, 0, 0, 1),
      privateAddress(172, 20, 1, 2),
      privateAddress(169, 254, 3, 4),
      privateAddress(8, 8, 8, 8)
    ].join('\n');

    expect(scanFixtureContent(content, [])).toEqual([
      { rule: 'private-ipv4', line: 1 },
      { rule: 'private-ipv4', line: 2 },
      { rule: 'private-ipv4', line: 3 }
    ]);
  });
});

describe('fixture tree scanning', () => {
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
