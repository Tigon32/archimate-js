import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime script is intentionally plain ESM without a declaration file.
import { classifyAutomergeCandidate, evaluateDrainState, latestRunsByName } from '../../scripts/drain-agent-pr.mjs';

const repository = 'Tigon32/archimate-js';
const basePr = {
  state: 'open',
  user: { login: 'Tigon32' },
  draft: false,
  mergeable: true,
  mergeable_state: 'clean',
  base: { ref: 'main' },
  head: { ref: 'agent/example/issue-1', sha: 'abc123', repo: { full_name: repository } },
  labels: []
};

function run(
  name: string,
  id: number,
  status: string = 'completed',
  conclusion: string | null = 'success'
) {
  return { name, id, status, conclusion };
}

describe('agent PR drain workflow state', () => {
  it('keeps only the newest run per workflow name', () => {
    const latest = latestRunsByName([
      run('CI', 1, 'completed', 'skipped'),
      run('CI', 2, 'completed', 'success')
    ]);
    expect(latest.get('CI')?.id).toBe(2);
    expect(latest.get('CI')?.conclusion).toBe('success');
  });

  it('merges a ready same-repo agent PR after exact-head workflows succeed', () => {
    const decision = evaluateDrainState({
      pr: basePr,
      repository,
      runs: [run('CI', 10), run('Automated security analysis', 11), run('MEFF XSD validation', 12, 'completed', 'skipped')]
    });
    expect(decision).toEqual({ action: 'merge', reason: 'all-exact-head-workflows-green:agent' });
  });

  it('does not treat skipped required workflows as qualification', () => {
    const decision = evaluateDrainState({
      pr: basePr,
      repository,
      runs: [run('CI', 10), run('Automated security analysis', 11, 'completed', 'skipped')]
    });
    expect(decision.action).toBe('block');
  });
});

describe('agent PR drain failure handling', () => {
  it('waits while an exact-head workflow is still running', () => {
    const decision = evaluateDrainState({
      pr: basePr,
      repository,
      runs: [run('CI', 10), run('Automated security analysis', 11, 'in_progress', null)]
    });
    expect(decision.action).toBe('wait');
  });

  it('blocks on any failed pull-request workflow', () => {
    const decision = evaluateDrainState({
      pr: basePr,
      repository,
      runs: [run('CI', 10), run('Automated security analysis', 11), run('MEFF XSD validation', 12, 'completed', 'failure')]
    });
    expect(decision.action).toBe('block');
  });

  it('supports the no-auto-merge emergency brake', () => {
    const decision = evaluateDrainState({
      pr: { ...basePr, labels: [{ name: 'no-auto-merge' }] },
      repository,
      runs: [run('CI', 10), run('Automated security analysis', 11)]
    });
    expect(decision).toEqual({ action: 'skip', reason: 'opt-out-label' });
  });
});

describe('Dependabot drain eligibility', () => {
  it('allows configured grouped minor/patch lanes', () => {
    const safe = {
      ...basePr,
      user: { login: 'dependabot[bot]' },
      head: { ...basePr.head, ref: 'dependabot/npm_and_yarn/npm-security-minor-and-patch-acde1234' }
    };
    expect(classifyAutomergeCandidate(safe, repository)).toMatchObject({
      eligible: true,
      kind: 'dependabot',
      group: 'npm-security-minor-and-patch'
    });
  });

  it('keeps unknown Dependabot updates manual', () => {
    const unknown = {
      ...basePr,
      user: { login: 'dependabot[bot]' },
      head: { ...basePr.head, ref: 'dependabot/npm_and_yarn/some-major-update' }
    };
    expect(classifyAutomergeCandidate(unknown, repository)).toEqual({
      eligible: false,
      reason: 'dependabot-not-allowlisted'
    });
  });

  it('requires the real Dependabot author', () => {
    const spoofed = {
      ...basePr,
      head: { ...basePr.head, ref: 'dependabot/npm_and_yarn/npm-minor-and-patch-acde1234' }
    };
    expect(classifyAutomergeCandidate(spoofed, repository)).toEqual({
      eligible: false,
      reason: 'unsupported-branch'
    });
  });
});

describe('drain trust boundaries', () => {
  it('never drains fork branches', () => {
    const decision = evaluateDrainState({
      pr: { ...basePr, head: { ...basePr.head, repo: { full_name: 'someone/fork' } } },
      repository,
      runs: []
    });
    expect(decision.action).toBe('skip');
  });

  it('never drains unsupported human branches', () => {
    const decision = evaluateDrainState({
      pr: { ...basePr, head: { ...basePr.head, ref: 'feature/manual' } },
      repository,
      runs: []
    });
    expect(decision).toEqual({ action: 'skip', reason: 'unsupported-branch' });
  });
});
