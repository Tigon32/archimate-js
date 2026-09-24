/* SYNTHETIC provenance: hand-authored from the public ADR-0005 runbook examples. */
const validRecords: unknown[] = [
  {
    schema: 'archimate-js.agent-claim/v1', record_type: 'claim', issue: 207,
    claim_comment_id: null, actor_id: 'synthetic-run-claim', github_login: 'example-bot',
    lease_id: 'synthetic-lease-claim', epoch: 1, claimed_at: '2026-09-24T17:00:00Z',
    heartbeat_at: '2026-09-24T17:00:00Z', expires_at: '2026-09-24T19:00:00Z',
    lease_started_at: '2026-09-24T17:00:00Z', last_work_observed_at: '2026-09-24T17:00:00Z',
    supersedes_claim_comment_id: null, branch: 'agent/synthetic/issue-207-parser', state: 'active'
  },
  {
    schema: 'archimate-js.agent-claim/v1', record_type: 'heartbeat', issue: 207,
    claim_comment_id: '7000000101', actor_id: 'synthetic-run-heartbeat', github_login: 'example-bot',
    lease_id: 'synthetic-lease-heartbeat', epoch: 1, heartbeat_at: '2026-09-24T18:10:00Z',
    expires_at: '2026-09-24T20:10:00Z', lease_started_at: '2026-09-24T18:00:00Z',
    last_work_observed_at: '2026-09-24T18:09:00Z', supersedes_claim_comment_id: null,
    branch: 'agent/synthetic/issue-207-parser', state: 'active'
  },
  {
    schema: 'archimate-js.agent-claim/v1', record_type: 'release', issue: 207,
    claim_comment_id: '7000000010', actor_id: 'synthetic-run-release', github_login: 'example-bot',
    lease_id: 'synthetic-lease-release', epoch: 3, released_at: '2026-09-24T13:30:00Z',
    supersedes_claim_comment_id: null, branch: 'agent/synthetic/issue-207-parser', state: 'released'
  },
  {
    schema: 'archimate-js.agent-claim/v1', record_type: 'supersede', issue: 207,
    claim_comment_id: '7000000090', actor_id: 'synthetic-maintainer-resolution', github_login: 'example-bot',
    lease_id: 'synthetic-resolution', epoch: 4, supersedes_claim_comment_id: '7000000090',
    superseded_at: '2026-09-24T14:00:00Z', reason: 'Synthetic duplicate claim resolution.',
    branch: 'agent/synthetic/issue-207-parser', state: 'superseded'
  },
  {
    schema: 'archimate-js.agent-claim/v1', record_type: 'takeover', issue: 207,
    claim_comment_id: null, actor_id: 'synthetic-run-takeover-request', github_login: 'example-bot',
    lease_id: 'synthetic-lease-takeover-request', epoch: 7,
    supersedes_claim_comment_id: '7000000290', observed_expired_at: '2026-09-24T18:00:00Z',
    observation_started_at: '2026-09-24T18:01:00Z', branch: 'agent/synthetic/issue-207-parser',
    state: 'takeover-requested'
  },
  {
    schema: 'archimate-js.agent-claim/v1', record_type: 'takeover', issue: 207,
    claim_comment_id: null, actor_id: 'synthetic-run-takeover-active', github_login: 'example-bot',
    lease_id: 'synthetic-lease-takeover-active', epoch: 7,
    supersedes_claim_comment_id: '7000000290', observed_expired_at: '2026-09-24T18:00:00Z',
    observation_started_at: '2026-09-24T18:01:00Z', observation_ended_at: '2026-09-24T18:16:00Z',
    maintainer_ack_comment_id: '7000000299', claimed_at: '2026-09-24T18:16:30Z',
    heartbeat_at: '2026-09-24T18:16:30Z', expires_at: '2026-09-24T20:16:30Z',
    lease_started_at: '2026-09-24T18:16:30Z', last_work_observed_at: '2026-09-24T18:16:30Z',
    branch: 'agent/synthetic/issue-207-parser', state: 'active'
  },
  {
    schema: 'archimate-js.agent-claim/v1', record_type: 'handoff', issue: 207,
    claim_comment_id: '7000000200', actor_id: 'synthetic-run-handoff', github_login: 'example-bot',
    lease_id: 'synthetic-lease-handoff', epoch: 5, supersedes_claim_comment_id: null,
    handoff_at: '2026-09-24T16:00:00Z', commit_sha: '0123456789abcdef0123456789abcdef01234567',
    changed_files: ['src/coordination/agent-claim-record.mts'], checks: ['typecheck', 'unit tests'],
    handoff_summary: 'Synthetic parser work is ready for review.',
    risks: ['Controller-level history validation remains future work.'],
    branch: 'agent/synthetic/issue-207-parser', state: 'released'
  }
];

export const validAgentClaimComments = validRecords.map((record) =>
  `Synthetic comment fixture.\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``
);

export const invalidAgentClaimComments = [
  {
    name: 'duplicate key',
    body: '```json\n{"schema":"archimate-js.agent-claim/v1","schema":"archimate-js.agent-claim/v1"}\n```'
  },
  {
    name: 'malformed protocol JSON',
    body: '```json\n{"schema":"archimate-js.agent-claim/v1",}\n```'
  },
  {
    name: 'protocol marker outside a fenced JSON block',
    body: 'archimate-js.agent-claim/v1'
  },
  {
    name: 'protocol record in a non-JSON fence',
    body: '```text\n{"schema":"archimate-js.agent-claim/v1"}\n```'
  }
];
