import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime script is intentionally plain ESM without a declaration file.
import { isAgentBranch } from '../../scripts/finalize-agent-pr.mjs';

describe('agent PR finalization', () => {
  it('only promotes the reserved agent branch namespace', () => {
    expect(isAgentBranch('agent/run/issue-1')).toBe(true);
    expect(isAgentBranch('feature/manual')).toBe(false);
    expect(isAgentBranch('main')).toBe(false);
    expect(isAgentBranch('')).toBe(false);
  });
});
