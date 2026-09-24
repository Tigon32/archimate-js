import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime controller is intentionally plain ESM.
import { classifyQueueCandidate, hasLiveQueueClaim, selectQueue } from '../../scripts/dependency-maintenance-queue.mjs';

const repository = 'Tigon32/archimate-js';
const pr = (number: number, branch: string, login = 'dependabot[bot]') => ({
  number, title: `dependency ${number}`, state: 'open', user: { login },
  head: { ref: branch, sha: `sha-${number}`, repo: { full_name: repository } }
});
const run = (name: string, conclusion: string, status = 'completed') => ({ id: 1, name, conclusion, status });

describe('dependency queue classification', () => {
  it('queues failed safe updates but not green auto-drain updates', () => {
    const safe = pr(10, 'dependabot/npm_and_yarn/npm-minor-and-patch-abc');
    expect(classifyQueueCandidate({ pr: safe, repository, runs: [run('CI', 'failure')] }).state).toBe('blocked');
    expect(classifyQueueCandidate({
      pr: safe, repository, runs: [run('CI', 'success'), run('Automated security analysis', 'success')]
    }).state).toBe('automatic');
  });

  it('queues green major or unknown updates for manual serialized review', () => {
    const major = pr(11, 'dependabot/github_actions/github/codeql-action/init-4.38.1');
    expect(classifyQueueCandidate({ pr: major, repository, runs: [run('CI', 'success')] }).state).toBe('manual');
  });
});

describe('dependency queue serialization', () => {
  it('selects the oldest queueable PR and suppresses the rest', () => {
    const result = selectQueue([
      { pr: pr(225, 'x'), classification: { state: 'blocked', failures: ['security'] } },
      { pr: pr(224, 'y'), classification: { state: 'blocked', failures: ['CI'] } }
    ]);
    expect(result.selected.pr.number).toBe(224);
    expect(result.waiting.map((item: any) => item.pr.number)).toEqual([225]);
  });

  it('recognizes an unexpired active lease and ignores a released lease', () => {
    const active = '2026-09-25T01:30:00Z';
    const comment = (state: string, expires_at: string) => ({
      body: `\`\`\`json\n{"schema":"archimate-js.agent-claim/v1","lease_id":"lease-1","state":"${state}","expires_at":"${expires_at}"}\n\`\`\``
    });
    expect(hasLiveQueueClaim([comment('active', active)], new Date('2026-09-25T01:00:00Z'))).toBe(true);
    expect(hasLiveQueueClaim([comment('active', active), comment('released', active)], new Date('2026-09-25T01:00:00Z'))).toBe(false);
  });
});
