import { describe, expect, it } from 'vitest';
import { isAgentBranch } from '../../src/coordination/agent-branch.mts';

describe('agent PR finalization', () => {
  it('only promotes the reserved agent branch namespace', () => {
    expect(isAgentBranch('agent/run/issue-1')).toBe(true);
    expect(isAgentBranch('feature/manual')).toBe(false);
    expect(isAgentBranch('main')).toBe(false);
    expect(isAgentBranch('')).toBe(false);
  });
});
