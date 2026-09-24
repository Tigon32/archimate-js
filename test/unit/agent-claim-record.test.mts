import { expect, it } from 'vitest';
import {
  invalidAgentClaimComments,
  validAgentClaimComments
} from './agent-claim-record.fixtures.mjs';
import { parseAgentClaimComment } from '../../src/coordination/agent-claim-record.mjs';

const wrap = (record: unknown): string => `\`\`\`json\n${JSON.stringify(record)}\n\`\`\``;
const decodedFixture = (comment: string): Record<string, unknown> => {
  const json = comment.match(/```json\n([\s\S]*?)\n```/)?.[1];
  if (!json) throw new Error('fixture has no JSON record');
  return JSON.parse(json) as Record<string, unknown>;
};

it('validates each record type from deterministic synthetic fixtures', () => {
  const recordTypes = new Set<string>();
  for (const comment of validAgentClaimComments) {
    const result = parseAgentClaimComment(comment, 207);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') recordTypes.add(result.record.record_type);
  }
  expect([...recordTypes].sort()).toEqual(['claim', 'handoff', 'heartbeat', 'release', 'supersede', 'takeover']);
  expect(validAgentClaimComments).toHaveLength(7);
});

it.each(invalidAgentClaimComments)('rejects $name fixtures', ({ body }) => {
  expect(parseAgentClaimComment(body).status).toBe('invalid');
});

it('rejects unknown fields and invalid record values', () => {
  const fixture = decodedFixture(validAgentClaimComments[0]);
  expect(parseAgentClaimComment(wrap({ ...fixture, unexpected: true })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...fixture, epoch: 0 })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...fixture, state: 'released' })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...fixture, issue: 208 }), 207).status).toBe('invalid');
});

it('enforces record-local lineage and lease transition constraints', () => {
  const claim = decodedFixture(validAgentClaimComments[0]);
  expect(parseAgentClaimComment(wrap({ ...claim, claim_comment_id: '7000000001' })).status).toBe('invalid');
  const heartbeat = decodedFixture(validAgentClaimComments[1]);
  expect(parseAgentClaimComment(wrap({ ...heartbeat, claim_comment_id: null })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...claim, supersedes_claim_comment_id: '7000000001' })).status).toBe('invalid');

  const supersede = decodedFixture(validAgentClaimComments[3]);
  expect(parseAgentClaimComment(wrap({ ...supersede, supersedes_claim_comment_id: '7000000091' })).status).toBe('invalid');

  const request = decodedFixture(validAgentClaimComments[4]);
  expect(parseAgentClaimComment(wrap({ ...request, claimed_at: '2026-09-24T18:16:30Z' })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...request, heartbeat_at: '2026-09-24T18:16:30Z' })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...request, expires_at: '2026-09-24T20:16:30Z' })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...request, lease_started_at: '2026-09-24T18:01:00Z' })).status).toBe('valid');

  const takeover = decodedFixture(validAgentClaimComments[5]);
  expect(parseAgentClaimComment(wrap({ ...takeover, observation_ended_at: '2026-09-24T18:14:00Z' })).status).toBe('invalid');

  const heartbeatSource = decodedFixture(validAgentClaimComments[1]);
  const longLease = {
    ...heartbeatSource,
    heartbeat_at: '2026-09-24T10:01:00Z',
    expires_at: '2026-09-24T12:01:00Z',
    lease_started_at: '2026-09-24T02:00:00Z',
    last_work_observed_at: '2026-09-24T10:00:00Z'
  };
  expect(parseAgentClaimComment(wrap(longLease)).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...longLease, maintainer_reack_comment_id: '7000000110' })).status).toBe('valid');
});

it('rejects invalid timestamps and lease timing constraints', () => {
  const fixture = decodedFixture(validAgentClaimComments[0]);
  expect(parseAgentClaimComment(wrap({ ...fixture, claimed_at: '2026-02-30T17:00:00Z' })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...fixture, expires_at: '2026-09-24T19:00:01Z' })).status).toBe('invalid');
  expect(parseAgentClaimComment(wrap({ ...fixture, last_work_observed_at: '2026-09-24T16:29:59Z' })).status).toBe('invalid');
});

it('distinguishes unrelated prose and permits explanatory text outside a fence', () => {
  expect(parseAgentClaimComment('Thanks, unrelated review note.').status).toBe('unrelated');
  expect(parseAgentClaimComment(`Claim created.\n\n${validAgentClaimComments[0]}`).status).toBe('valid');
});

it('rejects comments containing more than one protocol record', () => {
  expect(parseAgentClaimComment(`${validAgentClaimComments[0]}\n\n${validAgentClaimComments[1]}`).status).toBe('invalid');
});
