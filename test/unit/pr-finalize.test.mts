import { describe, expect, it } from 'vitest';
import { isAgentBranch } from '../../src/coordination/agent-branch.mjs';
import { githubRepositorySlug } from '../../src/coordination/github-repository.mjs';

describe('agent PR finalization', () => {
  it('only promotes the reserved agent branch namespace', () => {
    expect(isAgentBranch('agent/run/issue-1')).toBe(true);
    expect(isAgentBranch('feature/manual')).toBe(false);
    expect(isAgentBranch('main')).toBe(false);
    expect(isAgentBranch('')).toBe(false);
  });

  it('resolves the GitHub repository from HTTPS and SSH origin URLs', () => {
    expect(githubRepositorySlug('https://github.com/Tigon32/archimate-js.git')).toBe('Tigon32/archimate-js');
    expect(githubRepositorySlug('git@github.com:Tigon32/archimate-js.git')).toBe('Tigon32/archimate-js');
  });
});
