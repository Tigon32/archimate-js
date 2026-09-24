// SYNTHETIC: These checks inspect only repository-authored issue forms and guidance.
import { describe, expect, it } from 'vitest';
// @ts-expect-error Node types are not a runtime dependency of the browser package.
import { readFileSync, readdirSync } from 'node:fs';
import { load } from 'js-yaml';

const directory = new URL('../../.github/ISSUE_TEMPLATE/', import.meta.url);
const guidePath = 'docs/contributing/issues.md';
const categories = [
  'archimate-conformance.yml',
  'bug.yml',
  'feature-gap.yml',
  'research-spike.yml',
  'task-maintenance.yml'
];

function mapping(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Issue form must contain a YAML mapping');
  }
  return value as Record<string, unknown>;
}

function fields(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new TypeError('Issue form body must be a sequence');
  return value.map(mapping);
}

function validateForm(filename: string, value: unknown): void {
  const form = mapping(value);
  expect(typeof form.name).toBe('string');
  expect(typeof form.description).toBe('string');
  const body = fields(form.body);
  const ids = body.filter(({ type }) => type !== 'markdown').map(({ id }) => id);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
  expect(body.some(({ type, attributes }) => type === 'markdown' &&
    String(mapping(attributes).value).includes(guidePath))).toBe(true);

  const searches = body.filter(({ id }) => id === 'existing_work');
  if (filename === 'archimate-conformance.yml') {
    const checks = mapping(body.find(({ id }) => id === 'safety')?.attributes).options;
    expect(Array.isArray(checks) && checks.some((option) =>
      mapping(option).required === true && /search/i.test(String(mapping(option).label)))).toBe(true);
  } else {
    expect(searches).toHaveLength(1);
    expect(mapping(searches[0].validations).required).toBe(true);
    const checks = mapping(body.find(({ id }) => id === 'checks')?.attributes).options;
    expect(Array.isArray(checks) && checks.some((option) =>
      mapping(option).required === true && /public or synthetic/i.test(String(mapping(option).label)))).toBe(true);
  }

  if (filename === 'feature-gap.yml' || filename === 'task-maintenance.yml') {
    expect(mapping(body.find(({ id }) => id === 'blockers')?.validations).required).toBe(true);
    expect(body.some(({ id }) => id === 'related_work')).toBe(true);
  }
  if (filename === 'feature-gap.yml') {
    expect(mapping(body.find(({ id }) => id === 'proposed_direction')?.validations).required).toBe(true);
    expect(mapping(body.find(({ id }) => id === 'acceptance')?.validations).required).toBe(true);
  }
  if (filename === 'bug.yml') {
    expect(ids).toEqual(expect.arrayContaining([
      'reproduction', 'expected', 'actual', 'version_runtime'
    ]));
    expect(ids).not.toContain('proposed_solution');
    expect(ids).not.toContain('suspected_cause');
  }
}

describe('public issue forms', () => {
  it('parses every form and checks the required category and safety fields', () => {
    const filenames = readdirSync(directory).filter((name: string) => name.endsWith('.yml'));
    expect(filenames.sort()).toEqual([...categories, 'config.yml'].sort());
    for (const filename of categories) {
      const yaml = readFileSync(new URL(filename, directory), 'utf8');
      validateForm(filename, load(yaml));
    }
  });

  it('keeps one canonical guide linked from the issue chooser and contributor policies', () => {
    const config = mapping(load(readFileSync(new URL('config.yml', directory), 'utf8')));
    expect(config.blank_issues_enabled).toBe(false);
    expect(JSON.stringify(config.contact_links)).toContain(guidePath);
    for (const filename of [ 'CONTRIBUTING.md', 'AGENTS.md' ]) {
      expect(readFileSync(filename, 'utf8')).toContain(guidePath);
    }
    const guide = readFileSync(guidePath, 'utf8');
    expect(guide).toContain('native GitHub dependency');
    expect(guide).toContain('remove stale or redundant blocker links');
    expect(guide).toContain('SYNTHETIC');
  });

  it('rejects a form that loses its duplicate-search requirement', () => {
    const form = mapping(load(readFileSync(new URL('bug.yml', directory), 'utf8')));
    form.body = fields(form.body).filter(({ id }) => id !== 'existing_work');
    expect(() => validateForm('bug.yml', form)).toThrow();
  });
});
