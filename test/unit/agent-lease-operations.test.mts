/* SYNTHETIC provenance: hand-authored state transitions based on ADR-0005. */
import { expect, it } from 'vitest';
import {
  matchesAgentLeaseHistoryFence,
  proposeAgentLeaseOperation,
  type AgentLeaseOperationInput
} from '../../src/coordination/agent-lease-operations.mjs';
import type { AgentClaimHistoryComment } from '../../src/coordination/agent-claim-history.mjs';

const now = '2026-09-25T10:30:00Z';
const claim = {
  schema: 'archimate-js.agent-claim/v1', record_type: 'claim', issue: 282,
  claim_comment_id: null, actor_id: 'synthetic-run-a', github_login: 'example-bot',
  lease_id: 'synthetic-lease-a', epoch: 1, claimed_at: '2026-09-25T10:00:00Z',
  heartbeat_at: '2026-09-25T10:00:00Z', expires_at: '2026-09-25T12:00:00Z',
  lease_started_at: '2026-09-25T10:00:00Z', last_work_observed_at: '2026-09-25T10:00:00Z',
  supersedes_claim_comment_id: null, branch: 'agent/synthetic/issue-282-a', state: 'active'
} as const;

const comment = (id: string, record: unknown, created_at = '2026-09-25T10:00:01Z'): AgentClaimHistoryComment => ({
  id, created_at, body: `Synthetic fixture.\n\n\`\`\`json\n${JSON.stringify(record)}\n\`\`\``
});

const activeHistory = (): AgentClaimHistoryComment[] => [comment('1001', claim)];

const token = (overrides: Record<string, unknown> = {}) => ({
  claim_comment_id: '1001', actor_id: claim.actor_id, github_login: claim.github_login,
  lease_id: claim.lease_id, epoch: claim.epoch, branch: claim.branch, ...overrides
});

const input = (
  operation: AgentLeaseOperationInput['operation'],
  comments: readonly AgentClaimHistoryComment[] = [],
  issue_state: 'open' | 'closed' = 'open',
  at = now
): AgentLeaseOperationInput => ({ issue: 282, issue_state, comments, now: at, operation });

it('serializes competing claims by re-resolving the first committed history fence', () => {
  const request = {
    type: 'claim', actor_id: 'synthetic-run-a', github_login: 'example-bot',
    lease_id: 'synthetic-lease-a', branch: 'agent/synthetic/issue-282-a'
  } as const;
  const first = proposeAgentLeaseOperation(input(request));
  const competing = proposeAgentLeaseOperation(input({ ...request, lease_id: 'synthetic-lease-b' }));
  expect(first).toMatchObject({ status: 'proposed', expected_history: { comment_count: 0, last_comment_id: null } });
  expect(competing).toMatchObject({ status: 'proposed' });
  if (first.status !== 'proposed' || competing.status !== 'proposed') return;
  expect(competing.expected_history).toEqual(first.expected_history);
  const committed = [comment('1001', first.record, '2026-09-25T10:30:01Z')];
  expect(matchesAgentLeaseHistoryFence(first.expected_history, committed)).toBe(false);
  expect(matchesAgentLeaseHistoryFence(competing.expected_history, committed)).toBe(false);
  const second = proposeAgentLeaseOperation(input(request, committed, 'open', '2026-09-25T10:30:02Z'));
  expect(second).toMatchObject({ status: 'rejected', code: 'ACTIVE_LEASE', audit: { action: 'no-write' } });
});

it('fingerprints the full ordered comment history, including edits to older comments', () => {
  const history = [
    { id: '1001', created_at: '2026-09-25T10:00:00Z', body: 'Synthetic note A.' },
    { id: '1002', created_at: '2026-09-25T10:01:00Z', body: 'Synthetic note B.' }
  ];
  const proposal = (comments: AgentClaimHistoryComment[]) => proposeAgentLeaseOperation(input({
    type: 'claim', actor_id: 'synthetic-run-a', github_login: 'example-bot',
    lease_id: 'synthetic-lease-a', branch: 'agent/synthetic/issue-282-a'
  }, comments));
  const original = proposal(history);
  const edited = proposal([{ ...history[0], body: 'Synthetic note A, edited.' }, history[1]]);
  expect(original).toMatchObject({ status: 'proposed', expected_history: { comment_count: 2, last_comment_id: '1002' } });
  expect(edited).toMatchObject({ status: 'proposed', expected_history: { comment_count: 2, last_comment_id: '1002' } });
  if (original.status !== 'proposed' || edited.status !== 'proposed') return;
  expect(original.expected_history.history_sha256).not.toBe(edited.expected_history.history_sha256);
});

it.each([
  ['claim_comment_id', '9999'], ['actor_id', 'synthetic-stale'], ['github_login', 'other-bot'],
  ['lease_id', 'synthetic-old-lease'], ['epoch', 2], ['branch', 'agent/synthetic/other']
])('rejects a stale heartbeat token when %s differs', (field, value) => {
  const result = proposeAgentLeaseOperation(input({
    type: 'heartbeat', ...token({ [field]: value }), last_work_observed_at: now
  }, activeHistory()));
  expect(result).toMatchObject({ status: 'rejected', code: 'STALE_TOKEN' });
});

it('rejects heartbeat exactly at expiry and rejects requests on a closed issue', () => {
  const atExpiry = '2026-09-25T12:00:00Z';
  const expired = proposeAgentLeaseOperation(input({
    type: 'heartbeat', ...token(), last_work_observed_at: atExpiry
  }, activeHistory(), 'open', atExpiry));
  expect(expired).toMatchObject({ status: 'rejected', code: 'EXPIRED_LEASE' });
  const closed = proposeAgentLeaseOperation(input({
    type: 'heartbeat', ...token(), last_work_observed_at: now
  }, activeHistory(), 'closed'));
  expect(closed).toMatchObject({ status: 'rejected', code: 'ISSUE_CLOSED' });
});

it('releases the active claim on closed-issue reconciliation and preserves all assignees', () => {
  const assignees = ['z-human', 'example-bot', 'a-human'];
  const result = proposeAgentLeaseOperation(input({ type: 'reconcile-closed', current_assignees: assignees }, activeHistory(), 'closed'));
  expect(result).toMatchObject({
    status: 'proposed', operation: 'reconcile-closed',
    record: { record_type: 'release', claim_comment_id: '1001', state: 'released' },
    assignee_metadata: {
      claimant_login: 'example-bot', current_logins: ['a-human', 'example-bot', 'z-human'],
      preserve_logins: ['a-human', 'example-bot', 'z-human'], remove_claimant_login: false
    }
  });
});

it('increments the epoch after an explicit release and fails closed on ambiguous history', () => {
  const release = {
    schema: claim.schema, record_type: 'release', issue: 282, claim_comment_id: '1001',
    actor_id: claim.actor_id, github_login: claim.github_login, lease_id: claim.lease_id,
    epoch: 1, released_at: '2026-09-25T10:20:00Z', branch: claim.branch, state: 'released'
  };
  const replacement = proposeAgentLeaseOperation(input({
    type: 'claim', actor_id: 'synthetic-run-b', github_login: 'example-bot',
    lease_id: 'synthetic-lease-b', branch: 'agent/synthetic/issue-282-b'
  }, [comment('1001', claim), comment('1002', release, '2026-09-25T10:20:01Z')], 'open', now));
  expect(replacement).toMatchObject({ status: 'proposed', record: { epoch: 2 } });

  const ambiguous = proposeAgentLeaseOperation(input({
    type: 'claim', actor_id: 'synthetic-run-c', github_login: 'example-bot',
    lease_id: 'synthetic-lease-c', branch: 'agent/synthetic/issue-282-c'
  }, [{ id: 'invalid', created_at: now, body: 'archimate-js.agent-claim/v1' }]));
  expect(ambiguous).toMatchObject({ status: 'rejected', code: 'AMBIGUOUS_HISTORY' });
});

it('does not mutate caller-owned history or assignee inputs', () => {
  const history = activeHistory();
  const assignees = ['example-bot', 'human'];
  const before = JSON.stringify({ history, assignees });
  proposeAgentLeaseOperation(input({ type: 'reconcile-closed', current_assignees: assignees }, history, 'closed'));
  expect(JSON.stringify({ history, assignees })).toBe(before);
});
