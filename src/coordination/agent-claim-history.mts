import { parseAgentClaimComment, type AgentClaimRecord } from './agent-claim-record.mjs';

export interface AgentClaimHistoryComment {
  id: string;
  created_at: string;
  body: string;
}

export type AgentClaimHistoryResult =
  | { status: 'unclaimed' }
  | { status: 'active'; claim_comment_id: string; record: AgentClaimRecord }
  | { status: 'expired'; claim_comment_id: string; record: AgentClaimRecord }
  | { status: 'released'; claim_comment_id: string; record: AgentClaimRecord }
  | { status: 'ambiguous'; reason: string };

interface LeaseState {
  claimId: string;
  root: AgentClaimRecord;
  latest: AgentClaimRecord;
  latestAt: number;
  expiry: number | null;
  terminal: boolean;
}

/** Resolves a complete GitHub issue-comment history; any uncertainty fails closed. */
export function resolveAgentClaimHistory(
  comments: readonly AgentClaimHistoryComment[],
  issue: number,
  now: string | number
): AgentClaimHistoryResult {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) return ambiguous('resolution time is invalid');

  const ordered = [...comments].sort((left, right) => {
    const timeDifference = Date.parse(left.created_at) - Date.parse(right.created_at);
    return Number.isNaN(timeDifference) || timeDifference === 0 ? compareIds(left.id, right.id) : timeDifference;
  });
  const ids = new Set<string>();
  const commentTimes = new Map<string, number>();
  const parsed: Array<{ id: string; at: number; record: AgentClaimRecord }> = [];
  for (const comment of ordered) {
    if (!isId(comment.id) || ids.has(comment.id)) return ambiguous('comment IDs are invalid or duplicated');
    ids.add(comment.id);
    const at = Date.parse(comment.created_at);
    if (!Number.isFinite(at)) return ambiguous(`comment ${comment.id} has an invalid creation time`);
    commentTimes.set(comment.id, at);
    const result = parseAgentClaimComment(comment.body, issue);
    if (result.status === 'invalid') return ambiguous(`comment ${comment.id}: ${result.reason}`);
    if (result.status === 'valid') parsed.push({ id: comment.id, at, record: result.record });
  }

  const leases = new Map<string, LeaseState>();
  const byClaimId = new Map<string, LeaseState>();
  let highestEpoch = 0;
  let previousLease: LeaseState | undefined;

  for (const event of parsed) {
    const { id, at, record } = event;
    if (record.record_type === 'claim' || (record.record_type === 'takeover' && record.state === 'active')) {
      if (leases.has(record.lease_id)) return ambiguous(`lease ${record.lease_id} has more than one root record`);
      if (record.epoch !== highestEpoch + 1) return ambiguous('new lease epoch is not the next consecutive value');
      const takeoverPredecessor = record.record_type === 'takeover'
        ? byClaimId.get(record.supersedes_claim_comment_id)
        : undefined;
      const takeoverRecord = record.record_type === 'takeover' && record.state === 'active' ? record : undefined;
      const validExpiredTakeover = takeoverRecord !== undefined
        && takeoverPredecessor !== undefined
        && takeoverPredecessor === previousLease
        && !takeoverPredecessor.terminal
        && takeoverPredecessor.expiry !== null
        && takeoverPredecessor.expiry <= Date.parse(takeoverRecord.observed_expired_at);
      if (previousLease && !previousLease.terminal && !validExpiredTakeover) {
        return ambiguous('a new claim was posted before the previous lease was released or superseded');
      }

      if (record.record_type === 'claim' && record.epoch !== 1 && !previousLease?.terminal) {
        return ambiguous('a non-initial claim has no released predecessor');
      }
      if (record.record_type === 'takeover') {
        const oldLease = takeoverPredecessor;
        if (!oldLease || oldLease.terminal || oldLease.expiry === null || oldLease.expiry > Date.parse(record.observed_expired_at)) {
          return ambiguous('takeover does not identify an expired prior lease');
        }
        const ackAt = commentTimes.get(record.maintainer_ack_comment_id);
        const ack = ids.has(record.maintainer_ack_comment_id) && ackAt !== undefined && ackAt < at;
        if (!ack) return ambiguous('takeover maintainer acknowledgement comment is missing');
        const requested = parsed.find((candidate) => compareIds(candidate.id, id) < 0
          && candidate.record.record_type === 'takeover'
          && candidate.record.state === 'takeover-requested'
          && candidate.record.lease_id === record.lease_id
          && candidate.record.actor_id === record.actor_id
          && candidate.record.github_login === record.github_login
          && candidate.record.epoch === record.epoch
          && candidate.record.branch === record.branch
          && candidate.record.supersedes_claim_comment_id === record.supersedes_claim_comment_id
          && candidate.record.observed_expired_at === record.observed_expired_at
          && candidate.record.observation_started_at === record.observation_started_at);
        if (!requested) return ambiguous('active takeover has no preceding takeover request');
        if (at - requested.at < 15 * 60 * 1000) return ambiguous('takeover request observation window is shorter than 15 minutes');
        if (ackAt < Date.parse(record.observation_ended_at) || ackAt > Date.parse(record.claimed_at)) {
          return ambiguous('maintainer acknowledgement is outside the takeover observation and claim window');
        }
        oldLease.terminal = true;
      }

      const state: LeaseState = {
        claimId: id,
        root: record,
        latest: record,
        latestAt: at,
        expiry: expiryOf(record),
        terminal: false
      };
      leases.set(record.lease_id, state);
      byClaimId.set(id, state);
      highestEpoch = record.epoch;
      previousLease = state;
      continue;
    }

    if (record.record_type === 'takeover') {
      const old = byClaimId.get(record.supersedes_claim_comment_id);
      if (!old || old.terminal || old.expiry === null || old.expiry > Date.parse(record.observed_expired_at)) {
        return ambiguous('takeover request does not identify an expired prior lease');
      }
      if (record.epoch !== old.root.epoch + 1) return ambiguous('takeover request epoch does not follow the prior lease');
      continue;
    }

    const state = byClaimId.get(record.claim_comment_id);
    if (!state) return ambiguous(`transition ${id} references an unknown claim`);
    if (state.terminal) return ambiguous(`transition ${id} follows a terminal lease record`);
    if (!sameLease(state.root, record)) return ambiguous(`transition ${id} changes lease identity or epoch`);
    if (at < state.latestAt) return ambiguous(`transition ${id} is out of order`);
    if (record.record_type === 'heartbeat') {
      const priorHeartbeat = 'heartbeat_at' in state.latest ? Date.parse(state.latest.heartbeat_at) : Number.NaN;
      if (state.expiry !== null && Number.isFinite(priorHeartbeat) && Date.parse(record.heartbeat_at) < priorHeartbeat) {
        return ambiguous(`heartbeat ${id} moves lease time backwards`);
      }
      state.expiry = expiryOf(record);
    } else {
      state.terminal = true;
    }
    state.latest = record;
    state.latestAt = at;
    previousLease = state;
  }

  const live = [...leases.values()].filter((lease) => !lease.terminal && lease.expiry !== null && lease.expiry > nowMs);
  if (live.length > 1) return ambiguous('multiple active leases remain live');
  if (live.length === 1) return { status: 'active', claim_comment_id: live[0].claimId, record: live[0].latest };

  const latest = [...leases.values()].at(-1);
  if (!latest) return { status: 'unclaimed' };
  if (latest.terminal) return { status: 'released', claim_comment_id: latest.claimId, record: latest.latest };
  return { status: 'expired', claim_comment_id: latest.claimId, record: latest.latest };
}

function expiryOf(record: AgentClaimRecord): number | null {
  return 'expires_at' in record ? Date.parse(record.expires_at) : null;
}

function sameLease(root: AgentClaimRecord, transition: AgentClaimRecord): boolean {
  return root.lease_id === transition.lease_id
    && root.actor_id === transition.actor_id
    && root.github_login === transition.github_login
    && root.epoch === transition.epoch
    && root.branch === transition.branch;
}

function isId(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

function compareIds(left: string, right: string): number {
  if (!isId(left) || !isId(right)) return left.localeCompare(right);
  const leftId = BigInt(left);
  const rightId = BigInt(right);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function ambiguous(reason: string): AgentClaimHistoryResult {
  return { status: 'ambiguous', reason };
}
