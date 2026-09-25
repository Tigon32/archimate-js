import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ExceptionRecord = {
  path?: unknown;
  rationale?: unknown;
  expiresOn?: unknown;
  approver?: unknown;
  reviewedOn?: unknown;
};

type Policy = { schemaVersion?: unknown; exceptions?: unknown };
type Finding = { record: number | null; rule: string };

const REQUIRED_FIELDS = ['approver', 'expiresOn', 'path', 'rationale', 'reviewedOn'];
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_EXCEPTION_PATH_LENGTH = 512;

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isRepoFilePath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || Array.from(value).length > MAX_EXCEPTION_PATH_LENGTH ||
      value.startsWith('/') || value.endsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  if (value.includes('\\') || /[*?{}[\]]/.test(value) || /[\u0000-\u001f\u007f]/.test(value) || value.includes('//')) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** Validate governance metadata only; this does not establish source legality or approval authenticity. */
export function validatePublicSourceExceptions(policy: unknown, today = new Date().toISOString().slice(0, 10)): Finding[] {
  if (!isDate(today)) return [{ record: null, rule: 'invalid-validation-date' }];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return [{ record: null, rule: 'invalid-policy' }];
  }

  const candidate = policy as Policy;
  const policyKeys = Object.keys(candidate).sort();
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.exceptions) ||
      policyKeys.join(',') !== 'exceptions,schemaVersion') {
    return [{ record: null, rule: 'invalid-policy' }];
  }

  const findings: Finding[] = [];
  const paths = new Set<string>();
  for (const [index, value] of candidate.exceptions.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      findings.push({ record: index, rule: 'invalid-record' });
      continue;
    }
    const record = value as ExceptionRecord;
    const keys = Object.keys(record).sort();
    if (keys.join(',') !== REQUIRED_FIELDS.join(',')) {
      findings.push({ record: index, rule: 'invalid-record-fields' });
      continue;
    }
    if (!isRepoFilePath(record.path)) findings.push({ record: index, rule: 'invalid-path' });
    if (typeof record.rationale !== 'string' || !record.rationale.trim()) {
      findings.push({ record: index, rule: 'invalid-rationale' });
    }
    if (typeof record.approver !== 'string' || !GITHUB_LOGIN.test(record.approver)) {
      findings.push({ record: index, rule: 'invalid-approver' });
    }
    if (!isDate(record.reviewedOn) || (isDate(record.reviewedOn) && record.reviewedOn > today)) {
      findings.push({ record: index, rule: 'invalid-review-date' });
    }
    if (!isDate(record.expiresOn) || (isDate(record.expiresOn) && record.expiresOn < today)) {
      findings.push({ record: index, rule: 'invalid-expiration-date' });
    }
    if (isDate(record.reviewedOn) && isDate(record.expiresOn) && record.expiresOn < record.reviewedOn) {
      findings.push({ record: index, rule: 'expiration-before-review' });
    }
    if (isRepoFilePath(record.path)) {
      if (paths.has(record.path)) findings.push({ record: index, rule: 'duplicate-path' });
      paths.add(record.path);
    }
  }
  return findings;
}

export function formatPublicSourceExceptionFindings(findings: readonly Finding[]): string[] {
  return findings.map(({ record, rule }) => {
    const recordLabel = record === null ? '' : ` record ${record}`;
    return `Public-source exception policy failed: ${rule}${recordLabel}`;
  });
}

function readPolicy(): unknown {
  try {
    return JSON.parse(readFileSync(new URL('../docs/security/public-source-exceptions.json', import.meta.url), 'utf8')) as unknown;
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const findings = validatePublicSourceExceptions(readPolicy());
  if (findings.length) {
    for (const message of formatPublicSourceExceptionFindings(findings)) console.error(message);
    throw new Error('Public-source exception policy validation failed.');
  } else {
    console.log('Public-source exception policy passed.');
  }
}
