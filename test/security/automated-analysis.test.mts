// @ts-expect-error Node types are intentionally not runtime dependencies.
import assert from 'node:assert/strict';
// @ts-expect-error Node types are intentionally not runtime dependencies.
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

const ACTIONS = Object.freeze({
  'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'github/codeql-action/init': 'eaec7bdd3f18a9ef62b9f0d85d410932cf58c886',
  'github/codeql-action/analyze': 'eaec7bdd3f18a9ef62b9f0d85d410932cf58c886',
  'actions/dependency-review-action': '05fe4576374b728f0c523d6a13d64c25081e0803'
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
assert.deepEqual(record(codeqlSteps[0].with ?? {}, 'checkout.with'), {});
assert.equal(
  record(codeqlSteps.at(-1)?.with, 'analyze.with').upload,
  "${{ github.event_name != 'pull_request' || !github.event.pull_request.head.repo.fork }}"
);
assertPinnedActions([ ...codeqlSteps, ...dependencySteps ]);

console.log('Automated-analysis workflow policy test passed.');
