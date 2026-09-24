// @ts-expect-error Node types are intentionally not runtime dependencies.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are intentionally not runtime dependencies.
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

const ACTIONS = Object.freeze({
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'github/codeql-action/init': '1190a975f95ce23525efb6a3fc21ea29567c1b52',
  'github/codeql-action/analyze': '1190a975f95ce23525efb6a3fc21ea29567c1b52',
  'actions/dependency-review-action': 'a1d282b36b6f3519aa1f3fc636f609c47dddb294'
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${name} must be a mapping`);
  return value;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be a sequence`);
  return value;
}

function job(value: unknown, name: string): Record<string, unknown> {
  const result = record(value, name);
  assert.deepEqual(result['runs-on'], 'ubuntu-24.04');
  assert.ok(Number.isInteger(result['timeout-minutes']));
  return result;
}

function steps(value: unknown, name: string): Record<string, unknown>[] {
  return array(value, name).map((step, index) => record(step, `${name}[${index}]`));
}

function assertExactPermissions(value: unknown, expected: Record<string, string>): void {
  assert.deepEqual(record(value, 'permissions'), expected);
}

function assertPinnedActions(allSteps: Record<string, unknown>[]): void {
  assert.ok(allSteps.length > 0);
  assert.ok(allSteps.every((step) => !Object.hasOwn(step, 'run')));
  const references = allSteps.map((step) => step.uses);
  assert.ok(references.every((reference) => typeof reference === 'string'));
  assert.deepEqual(references.sort(), Object.entries(ACTIONS)
    .map(([action, sha]) => `${action}@${sha}`)
    .sort());
}

const text = readFileSync(new URL('../../.github/workflows/automated-analysis.yml', import.meta.url), 'utf8');
const workflow = record(load(text, { json: true }), 'workflow');
const triggers = record(workflow.on, 'on');
const jobs = record(workflow.jobs, 'jobs');
const codeql = job(jobs.codeql, 'jobs.codeql');
const dependencyReview = job(jobs['dependency-review'], 'jobs.dependency-review');
const codeqlSteps = steps(codeql.steps, 'jobs.codeql.steps');
const dependencySteps = steps(dependencyReview.steps, 'jobs.dependency-review.steps');

assert.deepEqual(Object.keys(triggers).sort(), [ 'pull_request', 'push', 'schedule', 'workflow_dispatch' ]);
assert.deepEqual(triggers.push, { branches: [ 'main' ] });
assert.deepEqual(triggers.schedule, [{ cron: '23 4 * * 1' }]);
assertExactPermissions(workflow.permissions, { contents: 'read' });
assert.deepEqual(Object.keys(jobs).sort(), [ 'codeql', 'dependency-review' ]);
assertExactPermissions(codeql.permissions, { contents: 'read', 'security-events': 'write' });
assertExactPermissions(dependencyReview.permissions, { contents: 'read', 'pull-requests': 'read' });
assert.equal(dependencyReview.if, "github.event_name == 'pull_request'");
assert.deepEqual(record(dependencySteps[0].with, 'dependency-review.with'), {
  'fail-on-severity': 'high',
  'fail-on-scopes': 'runtime, development',
  'allow-licenses': 'MIT, MIT-0, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, MPL-2.0, CC0-1.0, OFL-1.1, CC-BY-3.0, CC-BY-4.0, BlueOak-1.0.0',
  'license-check': true,
  'vulnerability-check': true,
  'warn-only': false,
  'comment-summary-in-pr': 'never'
});
assert.deepEqual(record(codeqlSteps[0].with ?? {}, 'checkout.with'), {});
assert.equal(
  record(codeqlSteps.at(-1)?.with, 'analyze.with').upload,
  "${{ github.event_name != 'pull_request' || !github.event.pull_request.head.repo.fork }}"
);
assertPinnedActions([ ...codeqlSteps, ...dependencySteps ]);

console.log('Automated-analysis workflow policy test passed.');
