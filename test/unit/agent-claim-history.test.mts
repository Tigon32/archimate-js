/* SYNTHETIC provenance: hand-authored claim histories based on the public ADR-0005 runbook. */
import { expect, it } from 'vitest';
import { resolveAgentClaimHistory, type AgentClaimHistoryComment } from '../../src/coordination/agent-claim-history.mjs';

const claim = {
  schema: 'archimate-js.agent-claim/v1', record_type: 'claim', issue: 140,
  claim_comment_id: null, actor_id: 'synthetic-run-a', github_login: 'example-bot',
  lease_id: 'synthetic-lease-a', epoch: 1, claimed_at: '2026-09-25T10:00:00Z',
  heartbeat_at: '2026-09-25T10:00:00Z', expires_at: '2026-09-25T12:00:00Z',
  lease_started_at: '2026-09-25T10:00:00Z', last_work_observed_at: '2026-09-25T10:00:00Z',
  supersedes_claim_comment_id: null, branch: 'agent/synthetic/issue-140', state: 'active'
} as const;

const comment = (id: string, record: unknown, created_at = '2026-09-25T10:00:00Z'): AgentClaimHistoryComment => ({
  id, created_at, body: `Synthetic protocol fixture.\n\n\`\`\`json\n${JSON.stringify(record)}\n\`\`\``
});

const heartbeatRecord = (heartbeat_at: string, expires_at: string, last_work_observed_at: string) => {
  const { claimed_at: _claimedAt, ...base } = claim;
  return { ...base, record_type: 'heartbeat', claim_comment_id: '1001', heartbeat_at, expires_at, last_work_observed_at };
};

it('finds the sole active lease and returns its latest heartbeat', () => {
  const heartbeat = heartbeatRecord('2026-09-25T10:15:00Z', '2026-09-25T12:15:00Z', '2026-09-25T10:14:00Z');
  const result = resolveAgentClaimHistory([
    comment('1002', heartbeat, '2026-09-25T10:15:01Z'),
    comment('1001', claim, '2026-09-25T10:00:01Z')
  ], 140, '2026-09-25T11:00:00Z');
  if (result.status !== 'active') throw new Error(result.status === 'ambiguous' ? result.reason : result.status);
  expect(result).toMatchObject({
    status: 'active', claim_comment_id: '1001', record: { record_type: 'heartbeat', expires_at: '2026-09-25T12:15:00Z' }
  });
});

it('reports expired and explicitly released leases without treating either as active', () => {
  const history = [comment('1001', claim)];
  expect(resolveAgentClaimHistory(history, 140, '2026-09-25T12:00:00Z').status).toBe('expired');
  const release = {
    schema: claim.schema, record_type: 'release', issue: 140, claim_comment_id: '1001',
    actor_id: claim.actor_id, github_login: claim.github_login, lease_id: claim.lease_id,
    epoch: 1, released_at: '2026-09-25T10:10:00Z', branch: claim.branch, state: 'released'
  };
  expect(resolveAgentClaimHistory([...history, comment('1002', release, '2026-09-25T10:10:01Z')], 140, '2026-09-25T10:11:00Z'))
    .toMatchObject({ status: 'released', claim_comment_id: '1001', record: { record_type: 'release' } });
});

it('does not let a heartbeat posted after expiry revive an expired lease', () => {
  const lateHeartbeat = heartbeatRecord('2026-09-25T12:30:00Z', '2026-09-25T14:30:00Z', '2026-09-25T12:29:00Z');
  const result = resolveAgentClaimHistory([
    comment('1001', claim, '2026-09-25T10:00:01Z'),
    comment('1002', lateHeartbeat, '2026-09-25T12:30:00Z')
  ], 140, '2026-09-25T13:00:00Z');
  expect(result).toMatchObject({ status: 'ambiguous', reason: 'heartbeat 1002 was posted after lease expiry' });
});

it('rejects a heartbeat timestamp later than its GitHub comment time', () => {
  const futureHeartbeat = heartbeatRecord('2026-09-25T13:00:00Z', '2026-09-25T15:00:00Z', '2026-09-25T12:59:00Z');
  const result = resolveAgentClaimHistory([
    comment('1001', claim, '2026-09-25T10:00:01Z'),
    comment('1002', futureHeartbeat, '2026-09-25T11:59:00Z')
  ], 140, '2026-09-25T13:00:00Z');
  expect(result).toMatchObject({ status: 'ambiguous', reason: 'heartbeat 1002 claims a time after its comment was posted' });
});

it('rejects a claim whose heartbeat timestamp is later than its GitHub comment time', () => {
  const futureClaim = {
    ...claim, heartbeat_at: '2026-09-25T13:00:00Z', expires_at: '2026-09-25T15:00:00Z',
    last_work_observed_at: '2026-09-25T12:59:00Z'
  };
  const result = resolveAgentClaimHistory([
    comment('1001', futureClaim, '2026-09-25T11:59:00Z')
  ], 140, '2026-09-25T13:00:00Z');
  expect(result).toMatchObject({ status: 'ambiguous', reason: 'heartbeat 1001 claims a time after its comment was posted' });
});

it('fails closed on malformed protocol attempts, unknown lineage, concurrent roots, and late stale writes', () => {
  const malformed = { id: '1001', created_at: '2026-09-25T10:00:00Z', body: 'archimate-js.agent-claim/v1' };
  expect(resolveAgentClaimHistory([malformed], 140, '2026-09-25T10:01:00Z').status).toBe('ambiguous');

  const otherClaim = { ...claim, lease_id: 'synthetic-lease-b', actor_id: 'synthetic-run-b', epoch: 2 };
  expect(resolveAgentClaimHistory([comment('1001', claim), comment('1002', otherClaim)], 140, '2026-09-25T10:01:00Z').status)
    .toBe('ambiguous');

  const unknownRelease = {
    schema: claim.schema, record_type: 'release', issue: 140, claim_comment_id: '9999',
    actor_id: claim.actor_id, github_login: claim.github_login, lease_id: claim.lease_id,
    epoch: 1, released_at: '2026-09-25T10:10:00Z', branch: claim.branch, state: 'released'
  };
  expect(resolveAgentClaimHistory([comment('1001', unknownRelease)], 140, '2026-09-25T10:11:00Z').status).toBe('ambiguous');

  const release = {
    schema: claim.schema, record_type: 'release', issue: 140, claim_comment_id: '1001',
    actor_id: claim.actor_id, github_login: claim.github_login, lease_id: claim.lease_id,
    epoch: 1, released_at: '2026-09-25T10:10:00Z', branch: claim.branch, state: 'released'
  };
  const heartbeatAfterRelease = heartbeatRecord('2026-09-25T10:15:00Z', '2026-09-25T12:15:00Z', '2026-09-25T10:14:00Z');
  expect(resolveAgentClaimHistory([
    comment('1001', claim), comment('1002', release), comment('1003', heartbeatAfterRelease)
  ], 140, '2026-09-25T10:16:00Z').status).toBe('ambiguous');
});

it('does not report a lease active after a takeover request alone', () => {
  const expiredClaim = { ...claim, expires_at: '2026-09-25T10:30:00Z' };
  const request = {
    schema: claim.schema, record_type: 'takeover', issue: 140, claim_comment_id: null,
    actor_id: 'synthetic-run-b', github_login: 'example-bot', lease_id: 'synthetic-lease-b', epoch: 2,
    supersedes_claim_comment_id: '1001', observed_expired_at: '2026-09-25T10:30:00Z',
    observation_started_at: '2026-09-25T10:31:00Z', branch: 'agent/synthetic/issue-140-b', state: 'takeover-requested'
  };
  expect(resolveAgentClaimHistory([
    comment('1001', expiredClaim, '2026-09-25T10:00:01Z'),
    comment('1002', request, '2026-09-25T10:31:01Z')
  ], 140, '2026-09-25T10:32:00Z')).toMatchObject({ status: 'expired', claim_comment_id: '1001' });
});

it.each([
  ['before the observed expiry', '2026-09-25T10:29:59Z'],
  ['before observation starts', '2026-09-25T10:30:59Z']
])('rejects a takeover request posted %s', (_case, created_at) => {
  const expiredClaim = { ...claim, expires_at: '2026-09-25T10:30:00Z' };
  const request = {
    schema: claim.schema, record_type: 'takeover', issue: 140, claim_comment_id: null,
    actor_id: 'synthetic-run-b', github_login: 'example-bot', lease_id: 'synthetic-lease-b', epoch: 2,
    supersedes_claim_comment_id: '1001', observed_expired_at: '2026-09-25T10:30:00Z',
    observation_started_at: '2026-09-25T10:31:00Z', branch: 'agent/synthetic/issue-140-b', state: 'takeover-requested'
  };
  const result = resolveAgentClaimHistory([
    comment('1001', expiredClaim, '2026-09-25T10:00:01Z'), comment('1002', request, created_at)
  ], 140, '2026-09-25T10:32:00Z');
  expect(result).toMatchObject({ status: 'ambiguous', reason: expect.stringContaining('posted before expiry or the observation window began') });
});

it('accepts a takeover only after the matching request, observation window, and prior acknowledgement', () => {
  const expiredClaim = { ...claim, expires_at: '2026-09-25T10:30:00Z' };
  const takeoverBase = {
    schema: claim.schema, record_type: 'takeover', issue: 140, claim_comment_id: null,
    actor_id: 'synthetic-run-b', github_login: 'example-bot', lease_id: 'synthetic-lease-b', epoch: 2,
    supersedes_claim_comment_id: '1001', observed_expired_at: '2026-09-25T10:30:00Z',
    observation_started_at: '2026-09-25T10:31:00Z', branch: 'agent/synthetic/issue-140-b'
  };
  const request = { ...takeoverBase, state: 'takeover-requested' };
  const active = {
    ...takeoverBase, state: 'active', observation_ended_at: '2026-09-25T10:46:00Z',
    maintainer_ack_comment_id: '1003', claimed_at: '2026-09-25T10:46:00Z',
    heartbeat_at: '2026-09-25T10:46:00Z', expires_at: '2026-09-25T12:46:00Z',
    lease_started_at: '2026-09-25T10:46:00Z', last_work_observed_at: '2026-09-25T10:46:00Z'
  };
  expect(resolveAgentClaimHistory([
    comment('1001', expiredClaim, '2026-09-25T10:00:01Z'),
    comment('1002', request, '2026-09-25T10:31:01Z'),
    { id: '1003', created_at: '2026-09-25T10:46:00Z', body: 'Synthetic maintainer acknowledgement.' },
    comment('1004', active, '2026-09-25T10:46:01Z')
  ], 140, '2026-09-25T10:50:00Z')).toMatchObject({ status: 'active', claim_comment_id: '1004', record: { epoch: 2 } });
});

it('rejects an active takeover whose heartbeat timestamp is later than its GitHub comment', () => {
  const expiredClaim = { ...claim, expires_at: '2026-09-25T10:30:00Z' };
  const takeoverBase = {
    schema: claim.schema, record_type: 'takeover', issue: 140, claim_comment_id: null,
    actor_id: 'synthetic-run-b', github_login: 'example-bot', lease_id: 'synthetic-lease-b', epoch: 2,
    supersedes_claim_comment_id: '1001', observed_expired_at: '2026-09-25T10:30:00Z',
    observation_started_at: '2026-09-25T10:31:00Z', branch: 'agent/synthetic/issue-140-b'
  };
  const active = {
    ...takeoverBase, state: 'active', observation_ended_at: '2026-09-25T10:46:00Z',
    maintainer_ack_comment_id: '1003', claimed_at: '2026-09-25T10:46:00Z',
    heartbeat_at: '2026-09-25T13:00:00Z', expires_at: '2026-09-25T15:00:00Z',
    lease_started_at: '2026-09-25T10:46:00Z', last_work_observed_at: '2026-09-25T12:59:00Z'
  };
  const result = resolveAgentClaimHistory([
    comment('1001', expiredClaim, '2026-09-25T10:00:01Z'),
    comment('1002', { ...takeoverBase, state: 'takeover-requested' }, '2026-09-25T10:31:01Z'),
    { id: '1003', created_at: '2026-09-25T10:46:00Z', body: 'Synthetic maintainer acknowledgement.' },
    comment('1004', active, '2026-09-25T11:59:00Z')
  ], 140, '2026-09-25T13:00:00Z');
  expect(result).toMatchObject({ status: 'ambiguous', reason: 'heartbeat 1004 claims a time after its comment was posted' });
});

it('rejects an active takeover comment posted before the observation window ends', () => {
  const expiredClaim = { ...claim, expires_at: '2026-09-25T10:30:00Z' };
  const takeoverBase = {
    schema: claim.schema, record_type: 'takeover', issue: 140, claim_comment_id: null,
    actor_id: 'synthetic-run-b', github_login: 'example-bot', lease_id: 'synthetic-lease-b', epoch: 2,
    supersedes_claim_comment_id: '1001', observed_expired_at: '2026-09-25T10:30:00Z',
    observation_started_at: '2026-09-25T10:31:00Z', branch: 'agent/synthetic/issue-140-b'
  };
  const active = {
    ...takeoverBase, state: 'active', observation_ended_at: '2026-09-25T10:46:00Z',
    maintainer_ack_comment_id: '1003', claimed_at: '2026-09-25T10:46:00Z',
    heartbeat_at: '2026-09-25T10:46:00Z', expires_at: '2026-09-25T12:46:00Z',
    lease_started_at: '2026-09-25T10:46:00Z', last_work_observed_at: '2026-09-25T10:46:00Z'
  };
  const result = resolveAgentClaimHistory([
    comment('1001', expiredClaim, '2026-09-25T10:00:01Z'),
    comment('1002', { ...takeoverBase, state: 'takeover-requested' }, '2026-09-25T10:31:01Z'),
    { id: '1003', created_at: '2026-09-25T10:45:00Z', body: 'Synthetic maintainer acknowledgement.' },
    comment('1004', active, '2026-09-25T10:45:59Z')
  ], 140, '2026-09-25T10:50:00Z');
  expect(result).toMatchObject({ status: 'ambiguous', reason: expect.stringContaining('posted before its observation window ended') });
});

it.each(['heartbeat', 'release'] as const)('cancels pending takeover after a later %s', (transitionType) => {
  const expiredClaim = { ...claim, expires_at: '2026-09-25T10:30:00Z' };
  const takeoverBase = {
    schema: claim.schema, record_type: 'takeover', issue: 140, claim_comment_id: null,
    actor_id: 'synthetic-run-b', github_login: 'example-bot', lease_id: 'synthetic-lease-b', epoch: 2,
    supersedes_claim_comment_id: '1001', observed_expired_at: '2026-09-25T10:30:00Z',
    observation_started_at: '2026-09-25T10:31:00Z', branch: 'agent/synthetic/issue-140-b'
  };
  const active = {
    ...takeoverBase, state: 'active', observation_ended_at: '2026-09-25T10:46:00Z',
    maintainer_ack_comment_id: '1004', claimed_at: '2026-09-25T10:46:00Z',
    heartbeat_at: '2026-09-25T10:46:00Z', expires_at: '2026-09-25T12:46:00Z',
    lease_started_at: '2026-09-25T10:46:00Z', last_work_observed_at: '2026-09-25T10:46:00Z'
  };
  const transition = transitionType === 'heartbeat'
    ? heartbeatRecord('2026-09-25T10:29:00Z', '2026-09-25T10:30:00Z', '2026-09-25T10:29:00Z')
    : {
        schema: claim.schema, record_type: 'release', issue: 140, claim_comment_id: '1001',
        actor_id: claim.actor_id, github_login: claim.github_login, lease_id: claim.lease_id,
        epoch: 1, released_at: '2026-09-25T10:32:00Z', branch: claim.branch, state: 'released'
      };
  const result = resolveAgentClaimHistory([
    comment('1001', expiredClaim, '2026-09-25T10:00:01Z'),
    comment('1002', { ...takeoverBase, state: 'takeover-requested' }, '2026-09-25T10:31:01Z'),
    comment('1003', transition, '2026-09-25T10:32:00Z'),
    { id: '1004', created_at: '2026-09-25T10:46:00Z', body: 'Synthetic maintainer acknowledgement.' },
    comment('1005', active, '2026-09-25T10:46:01Z')
  ], 140, '2026-09-25T10:50:00Z');
  const expectedReason = transitionType === 'heartbeat'
    ? 'heartbeat 1003 was posted after lease expiry'
    : 'active takeover has no preceding matching request without intervening transitions';
  expect(result).toMatchObject({ status: 'ambiguous', reason: expectedReason });
});

it('returns unclaimed for prose-only history', () => {
  expect(resolveAgentClaimHistory([{ id: '1', created_at: '2026-09-25T10:00:00Z', body: 'ordinary progress note' }], 140, '2026-09-25T10:01:00Z'))
    .toEqual({ status: 'unclaimed' });
});
