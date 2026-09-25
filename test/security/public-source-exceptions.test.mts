// SYNTHETIC provenance: exception records below are invented for validator coverage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { formatPublicSourceExceptionFindings, MAX_EXCEPTION_PATH_LENGTH, summarizePublicSourceExceptions, validatePublicSourceExceptions } from '../../scripts/check-public-source-exceptions.mts';

type ExceptionSchema = {
  properties: {
    exceptions: {
      items: {
        properties: {
          path: { maxLength: number; pattern: string };
          finding: { enum: string[] };
          rationale: { minLength: number; pattern: string };
        };
      };
    };
  };
};

const exceptionSchema = JSON.parse(readFileSync(new URL('../../docs/security/public-source-exceptions.schema.json', import.meta.url), 'utf8')) as ExceptionSchema;
const pathSchema = exceptionSchema.properties.exceptions.items.properties.path;
const rationaleSchema = exceptionSchema.properties.exceptions.items.properties.rationale;

const validRecord = {
  path: 'test/fixtures/synthetic-example.json',
  finding: 'unmanifested-model-or-media',
  rationale: 'SYNTHETIC review-only fixture record.',
  expiresOn: '2026-10-30',
  approver: 'synthetic-reviewer',
  reviewedOn: '2026-09-25'
};

const policy = (...exceptions: unknown[]) => ({ schemaVersion: 1, exceptions });

test('accepts an empty policy and a valid current SYNTHETIC record', () => {
  assert.deepEqual(validatePublicSourceExceptions({ schemaVersion: 1, exceptions: [] }, '2026-09-25'), []);
  assert.deepEqual(validatePublicSourceExceptions(policy(validRecord), '2026-09-25'), []);
});

test('schema and TypeScript agree on drive paths, rationale, path length, and one-character filenames', () => {
  const pathPattern = new RegExp(pathSchema.pattern);
  const rationalePattern = new RegExp(rationaleSchema.pattern);
  const schemaAcceptsPath = (value: string) => Array.from(value).length <= pathSchema.maxLength && pathPattern.test(value);
  const schemaAcceptsRationale = (value: string) => Array.from(value).length >= rationaleSchema.minLength && rationalePattern.test(value);
  assert.equal(pathSchema.maxLength, MAX_EXCEPTION_PATH_LENGTH);
  assert.equal(rationaleSchema.minLength, 1);
  assert.equal(schemaAcceptsPath(validRecord.path), true);
  assert.equal(schemaAcceptsPath('x'), true);
  assert.deepEqual(validatePublicSourceExceptions(policy({ ...validRecord, path: 'x' }), '2026-09-25'), []);
  assert.equal(schemaAcceptsPath('C:/private/file'), false);
  assert.ok(validatePublicSourceExceptions(policy({ ...validRecord, path: 'C:/private/file' }), '2026-09-25')
    .some((finding) => finding.rule === 'invalid-path'));
  assert.equal(schemaAcceptsRationale('   '), false);
  assert.ok(validatePublicSourceExceptions(policy({ ...validRecord, rationale: '   ' }), '2026-09-25')
    .some((finding) => finding.rule === 'invalid-rationale'));
  const tooLongPath = 'a'.repeat(MAX_EXCEPTION_PATH_LENGTH + 1);
  assert.equal(tooLongPath.length, 513);
  assert.equal(schemaAcceptsPath(tooLongPath), false);
  assert.ok(validatePublicSourceExceptions(policy({ ...validRecord, path: tooLongPath }), '2026-09-25')
    .some((finding) => finding.rule === 'invalid-path'));
});

test('fails closed on policy and record schema drift', () => {
  assert.equal(validatePublicSourceExceptions({ schemaVersion: 2, exceptions: [] }, '2026-09-25')[0]?.rule,
    'invalid-policy');
  assert.equal(validatePublicSourceExceptions(policy({ ...validRecord, approval: true }), '2026-09-25')[0]?.rule,
    'invalid-record-fields');
  assert.equal(validatePublicSourceExceptions(policy({ ...validRecord, finding: 'forbidden-tracked-path' }), '2026-09-25')[0]?.rule,
    'invalid-finding-class');
  assert.equal(validatePublicSourceExceptions(policy({ ...validRecord, rationale: '' }), '2026-09-25')[0]?.rule,
    'invalid-rationale');
});

test('release summary contains active rule metadata without paths or rationale', () => {
  const result = summarizePublicSourceExceptions(policy(validRecord), '2026-09-25');
  assert.deepEqual(result, {
    schemaVersion: 1,
    activeCount: 1,
    findingClasses: ['unmanifested-model-or-media'],
    earliestExpiry: '2026-10-30'
  });
  assert.equal(JSON.stringify(result).includes(validRecord.path), false);
  assert.equal(JSON.stringify(result).includes(validRecord.rationale), false);
  assert.equal(summarizePublicSourceExceptions(policy({ ...validRecord, expiresOn: '2026-09-24' }), '2026-09-25'), null);
});

test('rejects non-file paths, duplicate paths, and invalid or expired dates', () => {
  for (const path of ['/tmp/file', '../private.txt', 'docs//file', 'docs/*.md', 'docs/folder/']) {
    assert.ok(validatePublicSourceExceptions(policy({ ...validRecord, path }), '2026-09-25')
      .some((finding) => finding.rule === 'invalid-path'));
  }
  assert.ok(validatePublicSourceExceptions(policy(validRecord, validRecord), '2026-09-25')
    .some((finding) => finding.rule === 'duplicate-path'));
  for (const expiresOn of ['2026-02-30', '2026-09-24']) {
    assert.ok(validatePublicSourceExceptions(policy({ ...validRecord, expiresOn }), '2026-09-25')
      .some((finding) => finding.rule === 'invalid-expiration-date'));
  }
  assert.ok(validatePublicSourceExceptions(policy({ ...validRecord, reviewedOn: '2026-09-26' }), '2026-09-25')
    .some((finding) => finding.rule === 'invalid-review-date'));
  assert.ok(validatePublicSourceExceptions(policy({ ...validRecord, approver: 'not a login' }), '2026-09-25')
    .some((finding) => finding.rule === 'invalid-approver'));
});

test('findings and command diagnostics never include rationale or path content', () => {
  const privateLookingText = 'SYNTHETIC_PRIVATE_SENTINEL_DO_NOT_ECHO';
  const findings = validatePublicSourceExceptions(policy({ ...validRecord,
    path: '../bad', rationale: privateLookingText }), '2026-09-25');
  const output = formatPublicSourceExceptionFindings(findings).join('\n');
  assert.ok(!output.includes(privateLookingText));
  assert.ok(!output.includes('../bad'));
});
