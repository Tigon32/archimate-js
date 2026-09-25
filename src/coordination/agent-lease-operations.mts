import { createHash } from 'node:crypto';
import {
  AGENT_CLAIM_SCHEMA,
  parseAgentClaimComment,
  type AgentClaimRecord,
  type HeartbeatRecord,
  type ReleaseRecord
} from './agent-claim-record.mjs';
import {
  resolveAgentClaimHistory,
  type AgentClaimHistoryComment,
  type AgentClaimHistoryResult
} from './agent-claim-history.mjs';

const LEASE_MS = 2 * 60 * 60 * 1000;
const MAX_WINDOW_MS = 8 * 60 * 60 * 1000;
const MAX_WORK_AGE_MS = 30 * 60 * 1000;

export interface AgentLeaseToken {
  claim_comment_id: string;
  actor_id: string;
  github_login: string;
  lease_id: string;
  epoch: number;
  branch: string;
}

export type AgentLeaseOperation =
  | ({ type: 'claim' } & Omit<AgentLeaseToken, 'claim_comment_id' | 'epoch'>)
  | ({ type: 'heartbeat'; last_work_observed_at: string } & AgentLeaseToken)
  | ({ type: 'release' } & AgentLeaseToken)
  | ({ type: 'takeover-request' } & Omit<AgentLeaseToken, 'claim_comment_id' | 'epoch'>)
  | ({
    type: 'takeover-active';
    supersedes_claim_comment_id: string;
    observation_ended_at: string;
    maintainer_ack_comment_id: string;
  } & Omit<AgentLeaseToken, 'claim_comment_id'>)
  | { type: 'reconcile-closed'; current_assignees: readonly string[] };

type ClaimOperation = Extract<AgentLeaseOperation, { type: 'claim' }>;
type HeartbeatOperation = Extract<AgentLeaseOperation, { type: 'heartbeat' }>;
type ReleaseOperation = Extract<AgentLeaseOperation, { type: 'release' }>;
type TakeoverRequestOperation = Extract<AgentLeaseOperation, { type: 'takeover-request' }>;
type TakeoverActiveOperation = Extract<AgentLeaseOperation, { type: 'takeover-active' }>;
type ReconcileOperation = Extract<AgentLeaseOperation, { type: 'reconcile-closed' }>;

export interface AgentLeaseOperationInput {
  issue: number;
  issue_state: 'open' | 'closed';
  comments: readonly AgentClaimHistoryComment[];
  now: string;
  operation: AgentLeaseOperation;
}

export type AgentLeaseOperationCode =
  | 'INVALID_REQUEST'
  | 'INVALID_TIME'
  | 'AMBIGUOUS_HISTORY'
  | 'ACTIVE_LEASE'
  | 'TAKEOVER_REQUIRED'
  | 'ISSUE_CLOSED'
  | 'ISSUE_OPEN'
  | 'NO_ACTIVE_LEASE'
  | 'EXPIRED_LEASE'
  | 'STALE_TOKEN'
  | 'TAKEOVER_REQUEST_REQUIRED'
  | 'ACKNOWLEDGEMENT_REQUIRED'
  | 'REACK_REQUIRED'
  | 'INVALID_TRANSITION';

export interface AgentLeaseAudit {
  reason_code: string;
  action: 'append-comment' | 'no-write';
}

export interface AgentLeaseHistoryFence {
  comment_count: number;
  last_comment_id: string | null;
  history_sha256: string;
}

export interface ClosedIssueAssigneeMetadata {
  claimant_login: string;
  current_logins: readonly string[];
  preserve_logins: readonly string[];
  remove_claimant_login: false;
}

export type AgentLeaseOperationResult =
  | {
    status: 'proposed';
    operation: 'claim' | 'heartbeat' | 'release' | 'takeover-request' | 'takeover-active' | 'reconcile-closed';
    record: AgentClaimRecord;
    expected_history: AgentLeaseHistoryFence;
    audit: AgentLeaseAudit;
    assignee_metadata?: ClosedIssueAssigneeMetadata;
  }
  | {
    status: 'rejected' | 'no-op';
    code: AgentLeaseOperationCode;
    audit: AgentLeaseAudit;
  };

/** Creates a content-free, deterministic operation proposal; it performs no IO. */
export function proposeAgentLeaseOperation(input: AgentLeaseOperationInput): AgentLeaseOperationResult {
  if (!Number.isInteger(input.issue) || input.issue <= 0
    || (input.issue_state !== 'open' && input.issue_state !== 'closed')
    || !isUtcTimestamp(input.now)) {
    return rejected('INVALID_REQUEST');
  }
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) return rejected('INVALID_TIME');
  const history = resolveAgentClaimHistory(input.comments, input.issue, input.now);
  if (history.status === 'ambiguous') return rejected('AMBIGUOUS_HISTORY');

  if (input.operation.type === 'reconcile-closed') {
    return proposeClosedReconciliation(withOperation(input, input.operation), history);
  }
  if (input.issue_state === 'closed') return rejected('ISSUE_CLOSED');
  if (input.operation.type === 'claim') return proposeClaim(withOperation(input, input.operation), history);
  if (input.operation.type === 'heartbeat') return proposeHeartbeat(withOperation(input, input.operation), history, now);
  if (input.operation.type === 'takeover-request') {
    return proposeTakeoverRequest(withOperation(input, input.operation), history);
  }
  if (input.operation.type === 'takeover-active') {
    return proposeActiveTakeover(withOperation(input, input.operation), history, now);
  }
  return proposeRelease(withOperation(input, input.operation), history);
}

/** Checks that a proposal still matches the complete caller-fetched history. */
export function matchesAgentLeaseHistoryFence(
  expected: AgentLeaseHistoryFence,
  comments: readonly AgentClaimHistoryComment[]
): boolean {
  const current = historyFence(comments);
  return expected.comment_count === current.comment_count
    && expected.last_comment_id === current.last_comment_id
    && expected.history_sha256 === current.history_sha256;
}

function proposeClaim(
  input: InputWithOperation<ClaimOperation>,
  history: AgentClaimHistoryResult
): AgentLeaseOperationResult {
  if (!isNonEmpty(input.operation.actor_id) || !isNonEmpty(input.operation.github_login)
    || !isNonEmpty(input.operation.lease_id) || !isNonEmpty(input.operation.branch)) {
    return rejected('INVALID_REQUEST');
  }
  if (history.status === 'active') return rejected('ACTIVE_LEASE');
  if (history.status === 'expired') return rejected('TAKEOVER_REQUIRED');
  const epoch = history.status === 'released' ? history.record.epoch + 1 : 1;
  const record: AgentClaimRecord = {
    schema: AGENT_CLAIM_SCHEMA,
    record_type: 'claim',
    issue: input.issue,
    claim_comment_id: null,
    actor_id: input.operation.actor_id,
    github_login: input.operation.github_login,
    lease_id: input.operation.lease_id,
    epoch,
    claimed_at: input.now,
    heartbeat_at: input.now,
    expires_at: timestampAfter(input.now, LEASE_MS),
    lease_started_at: input.now,
    last_work_observed_at: input.now,
    supersedes_claim_comment_id: null,
    branch: input.operation.branch,
    state: 'active'
  };
  return proposed(input, 'claim', record, 'CLAIM_AVAILABLE');
}

function proposeHeartbeat(
  input: InputWithOperation<HeartbeatOperation>,
  history: AgentClaimHistoryResult,
  now: number
): AgentLeaseOperationResult {
  if (history.status !== 'active') return rejected(history.status === 'expired' ? 'EXPIRED_LEASE' : 'NO_ACTIVE_LEASE');
  if (!matchesToken(history, input.operation)) return rejected('STALE_TOKEN');
  const workAt = Date.parse(input.operation.last_work_observed_at);
  if (!isUtcTimestamp(input.operation.last_work_observed_at) || workAt > now || now - workAt > MAX_WORK_AGE_MS) {
    return rejected('INVALID_TIME');
  }
  const leaseStartedAt = history.record.lease_started_at;
  if (typeof leaseStartedAt !== 'string') return rejected('INVALID_TRANSITION');
  const leaseStarted = Date.parse(leaseStartedAt);
  const expiresAt = Math.min(now + LEASE_MS, leaseStarted + MAX_WINDOW_MS);
  if (expiresAt <= now) return rejected('REACK_REQUIRED');
  const record: HeartbeatRecord = {
    schema: AGENT_CLAIM_SCHEMA,
    record_type: 'heartbeat',
    issue: input.issue,
    claim_comment_id: history.claim_comment_id,
    actor_id: history.record.actor_id,
    github_login: history.record.github_login,
    lease_id: history.record.lease_id,
    epoch: history.record.epoch,
    heartbeat_at: input.now,
    expires_at: new Date(expiresAt).toISOString(),
    lease_started_at: leaseStartedAt,
    last_work_observed_at: input.operation.last_work_observed_at,
    supersedes_claim_comment_id: null,
    branch: history.record.branch,
    state: 'active'
  };
  return proposed(input, 'heartbeat', record, 'CURRENT_LEASE_RENEWED');
}

function proposeRelease(
  input: InputWithOperation<ReleaseOperation>,
  history: AgentClaimHistoryResult
): AgentLeaseOperationResult {
  if (history.status !== 'active') return rejected(history.status === 'expired' ? 'EXPIRED_LEASE' : 'NO_ACTIVE_LEASE');
  if (!matchesToken(history, input.operation)) return rejected('STALE_TOKEN');
  if (isBeforeLastKnownActivity(input.now, history.record)) return rejected('INVALID_TIME');
  const record: ReleaseRecord = {
    schema: AGENT_CLAIM_SCHEMA,
    record_type: 'release',
    issue: input.issue,
    claim_comment_id: history.claim_comment_id,
    actor_id: history.record.actor_id,
    github_login: history.record.github_login,
    lease_id: history.record.lease_id,
    epoch: history.record.epoch,
    released_at: input.now,
    supersedes_claim_comment_id: null,
    branch: history.record.branch,
    state: 'released'
  };
  return proposed(input, 'release', record, 'CURRENT_LEASE_RELEASED');
}

function proposeTakeoverRequest(
  input: InputWithOperation<TakeoverRequestOperation>,
  history: AgentClaimHistoryResult
): AgentLeaseOperationResult {
  if (!isNonEmpty(input.operation.actor_id) || !isNonEmpty(input.operation.github_login)
    || !isNonEmpty(input.operation.lease_id) || !isNonEmpty(input.operation.branch)) {
    return rejected('INVALID_REQUEST');
  }
  if (history.status !== 'expired') {
    return rejected(history.status === 'active' ? 'ACTIVE_LEASE' : 'NO_ACTIVE_LEASE');
  }
  if (!('expires_at' in history.record) || typeof history.record.expires_at !== 'string') {
    return rejected('INVALID_TRANSITION');
  }
  const record: AgentClaimRecord = {
    schema: AGENT_CLAIM_SCHEMA,
    record_type: 'takeover',
    issue: input.issue,
    claim_comment_id: null,
    actor_id: input.operation.actor_id,
    github_login: input.operation.github_login,
    lease_id: input.operation.lease_id,
    epoch: history.record.epoch + 1,
    supersedes_claim_comment_id: history.claim_comment_id,
    observed_expired_at: history.record.expires_at,
    observation_started_at: input.now,
    branch: input.operation.branch,
    state: 'takeover-requested'
  };
  return proposed(input, 'takeover-request', record, 'EXPIRED_LEASE_TAKEOVER_REQUESTED');
}

function proposeActiveTakeover(
  input: InputWithOperation<TakeoverActiveOperation>,
  history: AgentClaimHistoryResult,
  now: number
): AgentLeaseOperationResult {
  if (history.status !== 'expired') {
    return rejected(history.status === 'active' ? 'ACTIVE_LEASE' : 'NO_ACTIVE_LEASE');
  }
  const request = findMatchingTakeoverRequest(input, history);
  if (!request) return rejected('TAKEOVER_REQUEST_REQUIRED');
  if (!isUtcTimestamp(input.operation.observation_ended_at)
    || Date.parse(input.operation.observation_ended_at) > now
    || Date.parse(input.operation.observation_ended_at) - Date.parse(request.record.observation_started_at) < 15 * 60 * 1000
    || now - Date.parse(request.created_at) < 15 * 60 * 1000) {
    return rejected('INVALID_TIME');
  }
  const acknowledgement = input.comments.find((comment) => comment.id === input.operation.maintainer_ack_comment_id);
  if (!acknowledgement || Date.parse(acknowledgement.created_at) < Date.parse(input.operation.observation_ended_at)
    || Date.parse(acknowledgement.created_at) >= now) {
    return rejected('ACKNOWLEDGEMENT_REQUIRED');
  }
  const record: AgentClaimRecord = {
    schema: AGENT_CLAIM_SCHEMA,
    record_type: 'takeover',
    issue: input.issue,
    claim_comment_id: null,
    actor_id: input.operation.actor_id,
    github_login: input.operation.github_login,
    lease_id: input.operation.lease_id,
    epoch: input.operation.epoch,
    supersedes_claim_comment_id: input.operation.supersedes_claim_comment_id,
    observed_expired_at: request.record.observed_expired_at,
    observation_started_at: request.record.observation_started_at,
    observation_ended_at: input.operation.observation_ended_at,
    maintainer_ack_comment_id: input.operation.maintainer_ack_comment_id,
    claimed_at: input.now,
    heartbeat_at: input.now,
    expires_at: timestampAfter(input.now, LEASE_MS),
    lease_started_at: input.now,
    last_work_observed_at: input.now,
    branch: input.operation.branch,
    state: 'active'
  };
  return proposed(input, 'takeover-active', record, 'EXPIRED_LEASE_TAKEOVER_ACTIVATED');
}

function findMatchingTakeoverRequest(
  input: InputWithOperation<TakeoverActiveOperation>,
  history: Extract<AgentClaimHistoryResult, { status: 'expired' }>
): {
  record: Extract<AgentClaimRecord, { record_type: 'takeover'; state: 'takeover-requested' }>;
  created_at: string;
} | undefined {
  const match = input.comments
    .filter((comment) => Date.parse(comment.created_at) <= Date.parse(input.now))
    .sort((left, right) => {
      const difference = Date.parse(left.created_at) - Date.parse(right.created_at);
      return difference || compareIds(left.id, right.id);
    })
    .reverse()
    .map((comment) => ({ created_at: comment.created_at, parsed: parseAgentClaimComment(comment.body, input.issue) }))
    .find((candidate): candidate is {
      created_at: string;
      parsed: { status: 'valid'; record: Extract<AgentClaimRecord, { record_type: 'takeover'; state: 'takeover-requested' }> };
    } =>
      candidate.parsed.status === 'valid'
      && candidate.parsed.record.record_type === 'takeover'
      && candidate.parsed.record.state === 'takeover-requested'
      && candidate.parsed.record.actor_id === input.operation.actor_id
      && candidate.parsed.record.github_login === input.operation.github_login
      && candidate.parsed.record.lease_id === input.operation.lease_id
      && candidate.parsed.record.epoch === input.operation.epoch
      && candidate.parsed.record.branch === input.operation.branch
      && candidate.parsed.record.supersedes_claim_comment_id === input.operation.supersedes_claim_comment_id
      && candidate.parsed.record.supersedes_claim_comment_id === history.claim_comment_id);
  return match && { record: match.parsed.record, created_at: match.created_at };
}

function proposeClosedReconciliation(
  input: InputWithOperation<ReconcileOperation>,
  history: AgentClaimHistoryResult
): AgentLeaseOperationResult {
  if (input.issue_state !== 'closed') return rejected('ISSUE_OPEN');
  if (history.status !== 'active') return noOp(history.status === 'expired' ? 'EXPIRED_LEASE' : 'NO_ACTIVE_LEASE');
  if (isBeforeLastKnownActivity(input.now, history.record)) return rejected('INVALID_TIME');
  const record: ReleaseRecord = {
    schema: AGENT_CLAIM_SCHEMA,
    record_type: 'release',
    issue: input.issue,
    claim_comment_id: history.claim_comment_id,
    actor_id: history.record.actor_id,
    github_login: history.record.github_login,
    lease_id: history.record.lease_id,
    epoch: history.record.epoch,
    released_at: input.now,
    supersedes_claim_comment_id: null,
    branch: history.record.branch,
    state: 'released'
  };
  const assignees = sortedUnique(input.operation.current_assignees);
  const proposal = proposed(input, 'reconcile-closed', record, 'CLOSED_ISSUE_LEASE_RELEASED');
  if (proposal.status !== 'proposed') return proposal;
  return {
    ...proposal,
    assignee_metadata: {
      claimant_login: history.record.github_login,
      current_logins: assignees,
      preserve_logins: assignees,
      remove_claimant_login: false
    }
  };
}

function matchesToken(history: Extract<AgentClaimHistoryResult, { status: 'active' }>, token: AgentLeaseToken): boolean {
  const record = history.record;
  return token.claim_comment_id === history.claim_comment_id
    && token.actor_id === record.actor_id
    && token.github_login === record.github_login
    && token.lease_id === record.lease_id
    && token.epoch === record.epoch
    && token.branch === record.branch;
}

function proposed(
  input: AgentLeaseOperationInput,
  operation: 'claim' | 'heartbeat' | 'release' | 'takeover-request' | 'takeover-active' | 'reconcile-closed',
  record: AgentClaimRecord,
  reasonCode: string
): AgentLeaseOperationResult {
  const parsed = parseAgentClaimComment(`\`\`\`json\n${JSON.stringify(record)}\n\`\`\``, input.issue);
  if (parsed.status !== 'valid') return rejected('INVALID_TRANSITION');
  return {
    status: 'proposed',
    operation,
    record: parsed.record,
    expected_history: historyFence(input.comments),
    audit: { reason_code: reasonCode, action: 'append-comment' }
  };
}

type InputWithOperation<T extends AgentLeaseOperation> = Omit<AgentLeaseOperationInput, 'operation'> & { operation: T };

function withOperation<T extends AgentLeaseOperation>(
  input: AgentLeaseOperationInput,
  operation: T
): InputWithOperation<T> {
  return { ...input, operation };
}

function historyFence(comments: readonly AgentClaimHistoryComment[]): AgentLeaseHistoryFence {
  const ordered = [...comments].sort((left, right) => {
    const difference = Date.parse(left.created_at) - Date.parse(right.created_at);
    return difference || compareIds(left.id, right.id);
  });
  const digestInput = ordered.map(({ id, created_at, body }) => ({ id, created_at, body }));
  const history_sha256 = createHash('sha256').update(JSON.stringify(digestInput)).digest('hex');
  return { comment_count: comments.length, last_comment_id: ordered.at(-1)?.id ?? null, history_sha256 };
}

function rejected(code: AgentLeaseOperationCode): AgentLeaseOperationResult {
  return { status: 'rejected', code, audit: { reason_code: code, action: 'no-write' } };
}

function noOp(code: AgentLeaseOperationCode): AgentLeaseOperationResult {
  return { status: 'no-op', code, audit: { reason_code: code, action: 'no-write' } };
}

/**
 * Rejects a proposed timestamp that precedes the active lease's last known
 * heartbeat/claim activity, preventing an out-of-order release or closed
 * reconciliation from being proposed against a stale or invalid `now`.
 */
function isBeforeLastKnownActivity(candidateIso: string, record: AgentClaimRecord): boolean {
  if (!('heartbeat_at' in record) || typeof record.heartbeat_at !== 'string') return false;
  return Date.parse(candidateIso) < Date.parse(record.heartbeat_at);
}

function timestampAfter(value: string, duration: number): string {
  return new Date(Date.parse(value) + duration).toISOString();
}

function isUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(isNonEmpty))].sort((left, right) => left.localeCompare(right));
}

function compareIds(left: string, right: string): number {
  if (!/^[1-9]\d*$/.test(left) || !/^[1-9]\d*$/.test(right)) return left.localeCompare(right);
  const leftId = BigInt(left);
  const rightId = BigInt(right);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}
