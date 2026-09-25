/* SYNTHETIC provenance: hand-authored lease races based on ADR-0005. */
import { expect, it } from 'vitest';
import {
  InMemoryAgentLeaseController,
  type AgentLeaseControllerResult
} from '../../src/coordination/agent-lease-controller.mjs';
import type { AgentLeaseToken } from '../../src/coordination/agent-lease-operations.mjs';

const issue = 140;
const claimedAt = '2026-09-25T10:00:00Z';
const expiresAt = '2026-09-25T12:00:00Z';

const claimInput = (suffix: string, now = claimedAt) => ({
  issue,
  now,
  actor_id: `synthetic-run-${suffix}`,
  github_login: 'example-bot',
  lease_id: `synthetic-lease-${suffix}`,
  branch: `agent/synthetic/issue-140-${suffix}`
});

const appliedToken = (result: AgentLeaseControllerResult): AgentLeaseToken => {
  expect(result.status).toBe('applied');
  if (result.status !== 'applied' || !result.token) throw new Error('Expected an applied active lease token');
  return result.token;
};

const expiredClaimComment = (id = '1') => ({
  id,
  created_at: claimedAt,
  body: `\`\`\`json\n${JSON.stringify({
    schema: 'archimate-js.agent-claim/v1',
    record_type: 'claim',
    issue,
    claim_comment_id: null,
    actor_id: 'synthetic-expired-run',
    github_login: 'example-bot',
    lease_id: 'synthetic-expired-lease',
    epoch: 1,
    claimed_at: claimedAt,
    heartbeat_at: claimedAt,
    expires_at: '2026-09-25T10:30:00Z',
    lease_started_at: claimedAt,
    last_work_observed_at: claimedAt,
    supersedes_claim_comment_id: null,
    branch: 'agent/synthetic/issue-140-expired',
    state: 'active'
  })}\n\`\`\``
});

const takeoverInput = (now: string) => ({
  issue,
  now,
  actor_id: 'synthetic-takeover-run',
  github_login: 'example-bot',
  lease_id: 'synthetic-takeover-lease',
  branch: 'agent/synthetic/issue-140-takeover'
});

it('serializes concurrent claims so exactly one claimant is accepted', async () => {
  const controller = new InMemoryAgentLeaseController();
  const [first, second] = await Promise.all([
    controller.claim(claimInput('a')),
    controller.claim(claimInput('b'))
  ]);

  expect(first).toMatchObject({ status: 'applied', operation: 'claim', record: { epoch: 1 } });
  expect(second).toMatchObject({ status: 'rejected', code: 'ACTIVE_LEASE' });
  const snapshot = await controller.inspect(issue, claimedAt);
  expect(snapshot.history).toMatchObject({
    status: 'active',
    record: { actor_id: 'synthetic-run-a', lease_id: 'synthetic-lease-a' }
  });
  expect(snapshot.comments).toHaveLength(1);
});

it('serializes renew versus sweep in invocation order', async () => {
  const renewFirst = new InMemoryAgentLeaseController();
  const renewToken = appliedToken(await renewFirst.claim(claimInput('renew')));
  const heartbeat = renewFirst.renew({
    issue,
    now: '2026-09-25T11:59:00Z',
    last_work_observed_at: '2026-09-25T11:58:30Z',
    ...renewToken
  });
  const sweepAfterRenew = renewFirst.sweep(expiresAt);
  expect(await heartbeat).toMatchObject({ status: 'applied', operation: 'heartbeat' });
  expect(await sweepAfterRenew).toEqual([
    expect.objectContaining({ status: 'no-op', code: 'ACTIVE_LEASE' })
  ]);

  const sweepFirst = new InMemoryAgentLeaseController();
  const expiredToken = appliedToken(await sweepFirst.claim(claimInput('expired')));
  const sweep = sweepFirst.sweep(expiresAt);
  const lateHeartbeat = sweepFirst.heartbeat({
    issue,
    now: expiresAt,
    last_work_observed_at: expiresAt,
    ...expiredToken
  });
  expect(await sweep).toEqual([
    expect.objectContaining({ status: 'applied', operation: 'sweep-expired' })
  ]);
  expect(await lateHeartbeat).toMatchObject({ status: 'rejected', code: 'NO_ACTIVE_LEASE' });
});

it('rejects a stale release token without appending history', async () => {
  const controller = new InMemoryAgentLeaseController();
  const token = appliedToken(await controller.claim(claimInput('stale')));
  const before = await controller.inspect(issue, '2026-09-25T10:15:00Z');
  const result = await controller.release({
    issue,
    now: '2026-09-25T10:15:00Z',
    ...token,
    lease_id: 'synthetic-stale-lease'
  });

  expect(result).toMatchObject({ status: 'rejected', code: 'STALE_TOKEN' });
  const after = await controller.inspect(issue, '2026-09-25T10:15:00Z');
  expect(after.comments).toEqual(before.comments);
  expect(after.history).toMatchObject({ status: 'active' });
});

it('rejects claims on closed issues and reconciles a newly closed active issue', async () => {
  const closed = new InMemoryAgentLeaseController([{ issue, issue_state: 'closed' }]);
  expect(await closed.claim(claimInput('closed'))).toMatchObject({
    status: 'rejected',
    code: 'ISSUE_CLOSED'
  });

  const controller = new InMemoryAgentLeaseController();
  const token = appliedToken(await controller.claim(claimInput('closing')));
  const reconciled = await controller.reconcile({
    issue,
    now: '2026-09-25T10:30:00Z',
    issue_state: 'closed',
    current_assignees: ['human-b', 'example-bot', 'human-a']
  });
  expect(reconciled).toMatchObject({
    status: 'applied',
    operation: 'reconcile-closed',
    record: { record_type: 'release', lease_id: token.lease_id }
  });
  const snapshot = await controller.inspect(issue, '2026-09-25T10:30:00Z');
  expect(snapshot.history).toMatchObject({ status: 'released' });
  expect(snapshot.current_assignees).toEqual(['example-bot', 'human-a', 'human-b']);
});

it('does not let an old token or later sweep clear a replacement claim', async () => {
  const controller = new InMemoryAgentLeaseController();
  const oldToken = appliedToken(await controller.claim(claimInput('old')));
  expect(await controller.sweep(expiresAt)).toEqual([
    expect.objectContaining({ status: 'applied', operation: 'sweep-expired' })
  ]);

  const replacement = await controller.claim(claimInput('replacement', '2026-09-25T12:00:01Z'));
  const replacementToken = appliedToken(replacement);
  expect(replacement).toMatchObject({ status: 'applied', record: { epoch: 2 } });
  expect(await controller.release({
    issue,
    now: '2026-09-25T12:30:00Z',
    ...oldToken
  })).toMatchObject({ status: 'rejected', code: 'STALE_TOKEN' });
  expect(await controller.sweep('2026-09-25T12:30:00Z')).toEqual([
    expect.objectContaining({ status: 'no-op', code: 'ACTIVE_LEASE' })
  ]);

  const snapshot = await controller.inspect(issue, '2026-09-25T12:30:00Z');
  expect(snapshot.history).toMatchObject({
    status: 'active',
    record: { lease_id: replacementToken.lease_id, epoch: 2 }
  });
});

it('rejects a takeover request while the current lease remains active', async () => {
  const controller = new InMemoryAgentLeaseController();
  await controller.claim(claimInput('active-takeover'));

  expect(await controller.requestTakeover(takeoverInput('2026-09-25T10:15:00Z'))).toMatchObject({
    status: 'rejected',
    code: 'ACTIVE_LEASE'
  });
});

it('records a takeover request only after the current lease has expired', async () => {
  const controller = new InMemoryAgentLeaseController([{ issue, comments: [expiredClaimComment()] }]);

  const result = await controller.requestTakeover(takeoverInput('2026-09-25T10:31:00Z'));
  expect(result).toMatchObject({
    status: 'applied',
    operation: 'takeover-request',
    record: {
      record_type: 'takeover',
      state: 'takeover-requested',
      epoch: 2,
      supersedes_claim_comment_id: '1',
      observed_expired_at: '2026-09-25T10:30:00Z',
      observation_started_at: '2026-09-25T10:31:00Z'
    }
  });
  expect((await controller.inspect(issue, '2026-09-25T10:31:00Z')).history).toMatchObject({
    status: 'expired',
    claim_comment_id: '1'
  });
});

it('rejects takeover finalization before observation ends and without an acknowledgement', async () => {
  const controller = new InMemoryAgentLeaseController([{ issue, comments: [expiredClaimComment()] }]);
  await controller.requestTakeover(takeoverInput('2026-09-25T10:31:00Z'));
  const finalize = {
    ...takeoverInput('2026-09-25T10:45:59Z'),
    epoch: 2,
    supersedes_claim_comment_id: '1',
    observation_ended_at: '2026-09-25T10:45:59Z',
    maintainer_ack_comment_id: '99'
  };

  expect(await controller.finalizeTakeover(finalize)).toMatchObject({
    status: 'rejected',
    code: 'INVALID_TIME'
  });
  expect(await controller.finalizeTakeover({
    ...finalize,
    now: '2026-09-25T10:46:00Z',
    observation_ended_at: '2026-09-25T10:46:00Z'
  })).toMatchObject({ status: 'rejected', code: 'ACKNOWLEDGEMENT_REQUIRED' });
});

it('finalizes an acknowledged takeover and fences old tokens and later sweeps', async () => {
  const acknowledgement = {
    id: '2',
    created_at: '2026-09-25T10:45:00Z',
    body: 'Synthetic maintainer acknowledgement.'
  };
  const controller = new InMemoryAgentLeaseController([{
    issue,
    comments: [expiredClaimComment(), acknowledgement]
  }]);
  await controller.requestTakeover(takeoverInput('2026-09-25T10:30:00Z'));
  const result = await controller.finalizeTakeover({
    ...takeoverInput('2026-09-25T10:45:01Z'),
    epoch: 2,
    supersedes_claim_comment_id: '1',
    observation_ended_at: '2026-09-25T10:45:00Z',
    maintainer_ack_comment_id: acknowledgement.id
  });
  const takeoverToken = appliedToken(result);

  expect(result).toMatchObject({
    status: 'applied',
    operation: 'takeover-active',
    record: { record_type: 'takeover', state: 'active', epoch: 2 }
  });
  expect(await controller.release({
    issue,
    now: '2026-09-25T10:47:00Z',
    claim_comment_id: '1',
    actor_id: 'synthetic-expired-run',
    github_login: 'example-bot',
    lease_id: 'synthetic-expired-lease',
    epoch: 1,
    branch: 'agent/synthetic/issue-140-expired'
  })).toMatchObject({ status: 'rejected', code: 'STALE_TOKEN' });
  expect(await controller.sweep('2026-09-25T10:47:00Z')).toEqual([
    expect.objectContaining({ status: 'no-op', code: 'ACTIVE_LEASE' })
  ]);
  expect((await controller.inspect(issue, '2026-09-25T10:47:00Z')).history).toMatchObject({
    status: 'active',
    claim_comment_id: takeoverToken.claim_comment_id,
    record: { lease_id: takeoverToken.lease_id, epoch: 2 }
  });
});
