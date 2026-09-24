import { describe, expect, it } from 'vitest';
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

function run(name, id, status = 'completed', conclusion = 'success') {
  return { name, id, status, conclusion };
}

describe('agent PR drain', () => {
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
      runs: [
        run('CI', 10),
        run('Automated security analysis', 11),
        run('MEFF XSD validation', 12, 'completed', 'skipped')
      ]
    });
    expect(decision).toEqual({ action: 'merge', reason: 'all-exact-head-workflows-green:agent' });
  });

  it('does not mistake a skipped draft-era required workflow for qualification', () => {
    const decision = evaluateDrainState({
      pr: basePr,
      repository,
      runs: [
        run('CI', 10),
        run('Automated security analysis', 11, 'completed', 'skipped')
      ]
    });
    expect(decision.action).toBe('block');
  });

  it('waits while a workflow for the exact head is still running', () => {
    const decision = evaluateDrainState({
      pr: basePr,
      repository,
      runs: [
        run('CI', 10),
        run('Automated security analysis', 11, 'in_progress', null)
      ]
    });
    expect(decision.action).toBe('wait');
  });

  it('blocks on any failed pull-request workflow', () => {
    const decision = evaluateDrainState({
      pr: basePr,
      repository,
      runs: [
        run('CI', 10),
        run('Automated security analysis', 11),
        run('MEFF XSD validation', 12, 'completed', 'failure')
      ]
    });
    expect(decision.action).toBe('block');
  });

  it('supports an explicit no-auto-merge emergency brake', () => {
    const decision = evaluateDrainState({
      pr: { ...basePr, labels: [{ name: 'no-auto-merge' }] },
      repository,
      runs: [run('CI', 10), run('Automated security analysis', 11)]
    });
    expect(decision).toEqual({ action: 'skip', reason: 'opt-out-label' });
  });

  it('allows only configured grouped Dependabot minor/patch lanes', () => {
    const safe = {
      ...basePr,
      user: { login: 'dependabot[bot]' },
      head: {
        ...basePr.head,
        ref: 'dependabot/npm_and_yarn/npm-security-minor-and-patch-acde1234'
      }
    };
    expect(classifyAutomergeCandidate(safe, repository)).toMatchObject({
      eligible: true,
      kind: 'dependabot',
      group: 'npm-security-minor-and-patch'
    });

    const unknown = {
      ...safe,
      head: { ...safe.head, ref: 'dependabot/npm_and_yarn/some-major-update' }
    };
    expect(classifyAutomergeCandidate(unknown, repository)).toEqual({
      eligible: false,
      reason: 'dependabot-not-allowlisted'
    });
  });

  it('requires Dependabot to be the actual bot, not merely a matching branch name', () => {
    const spoofed = {
      ...basePr,
      head: {
        ...basePr.head,
        ref: 'dependabot/npm_and_yarn/npm-minor-and-patch-acde1234'
      }
    };
    expect(classifyAutomergeCandidate(spoofed, repository)).toEqual({
      eligible: false,
      reason: 'unsupported-branch'
    });
  });

  it('never drains fork or unsupported branches', () => {
    expect(evaluateDrainState({
      pr: { ...basePr, head: { ...basePr.head, repo: { full_name: 'someone/fork' } } },
      repository,
      runs: []
    }).action).toBe('skip');

    expect(evaluateDrainState({
      pr: { ...basePr, head: { ...basePr.head, ref: 'feature/manual' } },
      repository,
      runs: []
    })).toEqual({ action: 'skip', reason: 'unsupported-branch' });
  });
});
