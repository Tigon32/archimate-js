// All canaries below are SYNTHETIC and assembled in memory for this public repository.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { formatFindings, lineClassOf, scanSecretText, scanTrackedText, sortFindings } from '../../scripts/check-secrets.mts';
import { compileMarkerRules, loadMarkerRules } from '../../scripts/content-markers.mts';

const repoRoot = resolve(import.meta.dirname, '../..');
const githubCanary = ['ghp', '_', 'A'.repeat(24)].join('');
const awsCanary = ['AKIA', 'B'.repeat(16)].join('');
const keyCanary = ['-----BEGIN ', 'PRIVATE KEY', '-----'].join('');
const markerCanary = ['synthetic', '-', 'restricted', '-', 'marker'].join('');
const hostCanary = ['https://', 'build', '.', 'internal'].join('');
const addressCanary = [10, 11, 12, 13].join('.');
const classificationCanary = ['company', ' ', 'confidential'].join('');

// --- marker configuration -------------------------------------------------

const repoMarkers = loadMarkerRules(repoRoot, {});
assert.equal(repoMarkers.invalid, false);
assert.deepEqual(repoMarkers.rules.map(rule => rule.id), [
  'confidential-classification', 'private-collaboration-link', 'private-network-host',
  'private-network-ipv4-10', 'private-network-ipv4-172', 'private-network-ipv4-192-168'
]);

for (const invalid of [
  null,
  { version: 2, rules: [] },
  { version: 1, rules: {} },
  { version: 1, rules: [{ id: 'Bad Id', pattern: 'x' }] },
  { version: 1, rules: [{ id: 'dup', pattern: 'a' }, { id: 'dup', pattern: 'b' }] },
  { version: 1, rules: [{ id: 'bad-flags', pattern: 'a', flags: 'g' }] },
  { version: 1, rules: [{ id: 'bad-regex', pattern: '(' }] },
  { version: 1, rules: [{ id: 'too-long', pattern: 'a'.repeat(201) }] },
  { version: 1, rules: [{ id: 'nested-repeat', pattern: '^(a+)+$' }] },
  { version: 1, rules: [{ id: 'ambiguous-repeat', pattern: '(?:a|aa)+$' }] },
  { version: 1, rules: [{ id: 'lookahead', pattern: '(?=a)a' }] },
  { version: 1, rules: [{ id: 'large-repeat', pattern: 'a{1,1000}' }] },
  { version: 1, rules: [{ id: 'many-choices', pattern: 'a?'.repeat(13) }] },
  { version: 1, rules: [{ id: 'nested-bounded-repeat', pattern: '(?:a?b?c?d?e?f?g?){16}x' }] },
  { version: 1, rules: [{ id: 'nested-group-repeat', pattern: '(?:(?:a?b?){4}){4}x' }] },
  { version: 1, rules: [{ id: 'escaped-delimiter-repeat', pattern: '(?:\\.*){8}X' }] },
  { version: 1, rules: [{ id: 'wildcard-repeat', pattern: '.*' }] }
]) {
  assert.deepEqual(compileMarkerRules(invalid), { rules: [], invalid: true });
}
assert.equal(loadMarkerRules(repoRoot, { ARCHIMATE_CONTENT_MARKERS_FILE: 'docs/security/missing.json' }).invalid, true);
const markerConfigRoot = mkdtempSync(join(tmpdir(), 'archimate-marker-config-'));
try {
  const defaultPath = join(markerConfigRoot, 'docs', 'security', 'content-markers.json');
  mkdirSync(join(markerConfigRoot, 'docs', 'security'), { recursive: true });
  writeFileSync(defaultPath, '{ malformed json');
  assert.equal(loadMarkerRules(markerConfigRoot, {}).invalid, true);
  writeFileSync(defaultPath, JSON.stringify({ version: 1, rules: [] }));
  assert.equal(loadMarkerRules(markerConfigRoot, {}).invalid, false);
  rmSync(defaultPath);
  mkdirSync(defaultPath);
  assert.equal(loadMarkerRules(markerConfigRoot, {}).invalid, true);
  rmSync(defaultPath, { recursive: true });
  assert.equal(loadMarkerRules(markerConfigRoot, {}).invalid, true);
} finally {
  rmSync(markerConfigRoot, { recursive: true, force: true });
}

const markerIdCanary = 'synthetic-restricted-marker';
const customRule = compileMarkerRules({
  version: 1,
  rules: [{ id: markerIdCanary, pattern: 'synthetic-match' }]
});
assert.equal(customRule.invalid, false);
const customFinding = scanSecretText('synthetic-match', [], customRule.rules);
assert.deepEqual(customFinding.map(value => value.rule), ['marker-rule-1']);
assert.doesNotMatch(formatFindings(customFinding), new RegExp(markerIdCanary));

// --- content detection, redaction, and false positives --------------------

assert.deepEqual(
  scanSecretText([githubCanary, awsCanary, keyCanary, markerCanary].join('\n'), [markerCanary]).map(value => value.rule),
  ['github-token', 'aws-access-key', 'private-key-header', 'configured-marker']
);
assert.deepEqual(
  scanSecretText([hostCanary, addressCanary, classificationCanary].join('\n'), [], repoMarkers.rules)
    .map(value => value.rule),
  ['marker-rule-3', 'marker-rule-4', 'marker-rule-1']
);
assert.deepEqual(
  scanSecretText([[192, 168, 255, 0], [172, 31, 255, 255], [10, 255, 0, 1]]
    .map(octets => octets.join('.')).join('\n'), [], repoMarkers.rules)
    .map(value => value.rule),
  ['marker-rule-6', 'marker-rule-5', 'marker-rule-4']
);
assert.equal(compileMarkerRules({
  version: 1, rules: [{ id: 'bounded-group-repeat', pattern: '(?:a?b?){3}x' }]
}).invalid, false);
assert.deepEqual(
  scanSecretText([
    `ip=${[10, 0, 0, 1].join('.')}:8080`, `(${[172, 16, 0, 1].join('.')}).`,
    `${[192, 168, 1, 1].join('.')}.`
  ].join('\n'), [], repoMarkers.rules).map(value => value.rule),
  ['marker-rule-4', 'marker-rule-5', 'marker-rule-6']
);
assert.deepEqual(
  scanSecretText([[10, 1, 1, 1, 1], [1, 10, 1, 1, 1], [192, 168, 1, 1, 1], [172, 16, 1, 1, 1], [10, 1, 1, 12, 5]]
    .map(octets => octets.join('.')).join('\n'), [], repoMarkers.rules),
  []
);
assert.deepEqual(
  scanSecretText([[10, 256, 1, 1], [192, 168, 256, 1], [172, 16, 1, 256]]
    .map(octets => octets.join('.')).join('\n'), [], repoMarkers.rules),
  []
);
assert.deepEqual(scanSecretText('Public documentation with generic examples only.'), []);
assert.deepEqual(scanSecretText([
  'const label = item.local;',
  'const dns = "8.8.8.8";',
  'see https://www.opengroup.org/xsd/archimate/3.0/',
  'Documented internal API surface for this module.'
].join('\n'), [], repoMarkers.rules), []);

assert.equal(lineClassOf(1), '1-50');
assert.equal(lineClassOf(50), '1-50');
assert.equal(lineClassOf(51), '51-100');
assert.deepEqual(scanSecretText(['', '', githubCanary].join('\n')).map(value => value.lineClass), ['1-50']);
assert.deepEqual(
  scanSecretText([...Array<string>(60).fill(''), githubCanary].join('\n')).map(value => value.lineClass),
  ['51-100']
);

const report = formatFindings([
  { rule: 'github-token', severity: 'review', fileIndex: 2, lineClass: '1-50' },
  { rule: 'symlink-tracked-entry', severity: 'failure', fileIndex: 1 }
]);
assert.match(report, /Scanner failures \(1\):/);
assert.match(report, /Manual-review findings \(1\):/);
assert.match(report, /- tracked file 2, lines 1-50: github-token/);
assert.ok(report.indexOf('Scanner failures') < report.indexOf('Manual-review findings'));

// --- deterministic ordering ------------------------------------------------

const unordered = [
  { rule: 'github-token', severity: 'review' as const, fileIndex: 3, lineClass: '51-100' },
  { rule: 'aws-access-key', severity: 'review' as const, fileIndex: 3, lineClass: '1-50' },
  { rule: 'github-token', severity: 'review' as const, fileIndex: 1, lineClass: '101-150' },
  { rule: 'github-token', severity: 'review' as const, fileIndex: 3, lineClass: '1-50' },
  { rule: 'symlink-tracked-entry', severity: 'failure' as const, fileIndex: 9 }
];
const expectedOrder = [
  'symlink-tracked-entry:9:', 'aws-access-key:3:1-50', 'github-token:1:101-150',
  'github-token:3:1-50', 'github-token:3:51-100'
];
const asKeys = (findings: ReturnType<typeof sortFindings>) =>
  findings.map(finding => `${finding.rule}:${finding.fileIndex}:${finding.lineClass ?? ''}`);
assert.deepEqual(asKeys(sortFindings(unordered)), expectedOrder);
assert.deepEqual(asKeys(sortFindings([...unordered].reverse())), expectedOrder);

// --- tracked-content boundaries -------------------------------------------

const root = mkdtempSync(join(tmpdir(), 'archimate-secret-scan-'));
const outside = mkdtempSync(join(tmpdir(), 'archimate-secret-outside-'));
try {
  execFileSync('git', ['init', '-q', root], { stdio: 'ignore' });
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'canary.txt'), githubCanary);
  writeFileSync(join(root, 'docs', 'binary.bin'), Buffer.from([0, 1, 2]));
  writeFileSync(join(root, 'docs', 'invalid-utf8.txt'), Buffer.from([0x41, 0xc3, 0x28]));
  writeFileSync(join(root, 'docs', 'model.xml'), `<model description="${hostCanary}"/>`);
  writeFileSync(join(root, 'docs', 'utf8.txt'), 'Grüße — synthetic UTF-8 content only.');
  symlinkSync(join(root, 'docs', 'canary.txt'), join(root, 'docs', 'link.txt'));
  execFileSync('git', ['add', 'docs'], { cwd: root, stdio: 'ignore' });

  const result = scanTrackedText(root, [], repoMarkers.rules);
  assert.deepEqual(result.findings.map(value => `${value.rule}:${value.severity}`), [
    'symlink-tracked-entry:failure', 'github-token:review', 'marker-rule-3:review'
  ]);
  assert.deepEqual(result.findings.map(value => value.fileIndex), [4, 2, 5]);
  assert.equal(result.scanned, 3);
  assert.equal(result.skippedBinary, 2);

  const excludedResult = scanTrackedText(root, [], repoMarkers.rules, new Set(['docs/model.xml']));
  assert.deepEqual(excludedResult.findings.map(value => value.rule), ['symlink-tracked-entry', 'github-token']);
  assert.equal(excludedResult.scanned, 2);

  const script = new URL('../../scripts/check-secrets.mts', import.meta.url);
  const missingDefaultEnv: NodeJS.ProcessEnv = { ...process.env, ARCHIMATE_SECRET_SCAN_MARKERS: '' };
  delete missingDefaultEnv.ARCHIMATE_CONTENT_MARKERS_FILE;
  const missingDefaultCli = spawnSync(process.execPath, [script.pathname], {
    cwd: root, encoding: 'utf8', env: missingDefaultEnv
  });
  assert.equal(missingDefaultCli.status, 1);
  assert.match(missingDefaultCli.stderr, /Scanner failures \(2\):[\s\S]*marker-config-invalid/);

  const cli = spawnSync(process.execPath, [script.pathname], {
    cwd: root, encoding: 'utf8', env: {
      ...process.env, ARCHIMATE_SECRET_SCAN_MARKERS: '',
      ARCHIMATE_CONTENT_MARKERS_FILE: join(repoRoot, 'docs/security/content-markers.json')
    }
  });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /Manual-review findings \(2\):/);
  assert.match(cli.stderr, /tracked file 2, lines 1-50: github-token/);
  assert.doesNotMatch(cli.stdout + cli.stderr, new RegExp(githubCanary));
  assert.doesNotMatch(cli.stdout + cli.stderr, /canary\.txt|link\.txt|model\.xml/);

  writeFileSync(join(root, 'docs', 'canary.txt'), markerCanary);
  const markerCli = spawnSync(process.execPath, [script.pathname], {
    cwd: root, encoding: 'utf8', env: {
      ...process.env, ARCHIMATE_SECRET_SCAN_MARKERS: markerCanary,
      ARCHIMATE_CONTENT_MARKERS_FILE: join(repoRoot, 'docs/security/content-markers.json')
    }
  });
  assert.equal(markerCli.status, 1);
  assert.match(markerCli.stderr, /configured-marker/);
  assert.doesNotMatch(markerCli.stdout + markerCli.stderr, new RegExp(markerCanary));

  const badConfigCli = spawnSync(process.execPath, [script.pathname], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ARCHIMATE_CONTENT_MARKERS_FILE: 'missing-markers.json' }
  });
  assert.equal(badConfigCli.status, 1);
  assert.match(badConfigCli.stderr, /Scanner failures \(2\):[\s\S]*marker-config-invalid/);

  const unsafePattern = '(?:\\.*){8}X';
  const unsafeConfigPath = join(root, 'unsafe-markers.json');
  writeFileSync(unsafeConfigPath, JSON.stringify({
    version: 1, rules: [{ id: 'escaped-delimiter-repeat', pattern: unsafePattern }]
  }));
  const unsafeConfigCli = spawnSync(process.execPath, [script.pathname], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ARCHIMATE_CONTENT_MARKERS_FILE: unsafeConfigPath }
  });
  assert.equal(unsafeConfigCli.status, 1);
  assert.match(unsafeConfigCli.stderr, /Scanner failures \(2\):[\s\S]*marker-config-invalid/);
  assert.equal((unsafeConfigCli.stdout + unsafeConfigCli.stderr).includes(unsafePattern), false);
  assert.doesNotMatch(unsafeConfigCli.stdout + unsafeConfigCli.stderr, /unsafe-markers\.json/);

  renameSync(join(root, 'docs'), join(root, 'stored-docs'));
  writeFileSync(join(outside, 'canary.txt'), githubCanary);
  symlinkSync(outside, join(root, 'docs'));
  const escaped = scanTrackedText(root);
  assert.deepEqual(new Set(escaped.findings.map(value => value.rule)), new Set(['symlink-tracked-entry']));
  assert.equal(escaped.findings.length, 6);
  assert.ok(escaped.findings.every(value => value.severity === 'failure'));
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}

console.log('Synthetic content-scan checks passed.');
