// SYNTHETIC provenance: exception records below are invented for validator coverage.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPublicSourceExceptionFindings, validatePublicSourceExceptions } from '../../scripts/check-public-source-exceptions.mts';

const validRecord = {
  path: 'test/fixtures/synthetic-example.json',
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

test('fails closed on policy and record schema drift', () => {
  assert.equal(validatePublicSourceExceptions({ schemaVersion: 2, exceptions: [] }, '2026-09-25')[0]?.rule,
    'invalid-policy');
  assert.equal(validatePublicSourceExceptions(policy({ ...validRecord, approval: true }), '2026-09-25')[0]?.rule,
    'invalid-record-fields');
  assert.equal(validatePublicSourceExceptions(policy({ ...validRecord, rationale: '' }), '2026-09-25')[0]?.rule,
    'invalid-rationale');
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
