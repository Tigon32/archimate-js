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

interface ParsedEvent {
  id: string;
  at: number;
  record: AgentClaimRecord;
}

interface ParsedHistory {
  events: ParsedEvent[];
  ids: Set<string>;
  commentTimes: Map<string, number>;
}

interface HistoryContext extends ParsedHistory {
  leases: Map<string, LeaseState>;
  byClaimId: Map<string, LeaseState>;
  highestEpoch: number;
  previousLease: LeaseState | undefined;
}

/** Resolves a complete GitHub issue-comment history; any uncertainty fails closed. */
export function resolveAgentClaimHistory(
  comments: readonly AgentClaimHistoryComment[],
  issue: number,
  now: string | number
): AgentClaimHistoryResult {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) return ambiguous('resolution time is invalid');
  const parsed = parseHistory(comments, issue);
  if ('reason' in parsed) return ambiguous(parsed.reason);

  const context: HistoryContext = {
    ...parsed, leases: new Map(), byClaimId: new Map(), highestEpoch: 0, previousLease: undefined
  };
  for (const event of parsed.events) {
    const error = applyEvent(event, context);
    if (error) return ambiguous(error);
  }
  return summarizeHistory(context, nowMs);
}

function parseHistory(
  comments: readonly AgentClaimHistoryComment[],
  issue: number
): ParsedHistory | { reason: string } {
  const ordered = [...comments].sort((left, right) => {
    const timeDifference = Date.parse(left.created_at) - Date.parse(right.created_at);
    return Number.isNaN(timeDifference) || timeDifference === 0 ? compareIds(left.id, right.id) : timeDifference;
  });
  const ids = new Set<string>();
  const commentTimes = new Map<string, number>();
  const events: ParsedEvent[] = [];
  for (const comment of ordered) {
    if (!isId(comment.id) || ids.has(comment.id)) return { reason: 'comment IDs are invalid or duplicated' };
    ids.add(comment.id);
    const at = Date.parse(comment.created_at);
    if (!Number.isFinite(at)) return { reason: `comment ${comment.id} has an invalid creation time` };
    commentTimes.set(comment.id, at);
    const result = parseAgentClaimComment(comment.body, issue);
    if (result.status === 'invalid') return { reason: `comment ${comment.id}: ${result.reason}` };
    if (result.status === 'valid') events.push({ id: comment.id, at, record: result.record });
  }
  return { events, ids, commentTimes };
}

function applyEvent(event: ParsedEvent, context: HistoryContext): string | undefined {
  const { record } = event;
  if (record.record_type === 'claim' || (record.record_type === 'takeover' && record.state === 'active')) {
    return applyRootEvent(event, context);
  }
  if (record.record_type === 'takeover') return applyTakeoverRequest(event, context);
  return applyTransition(event, context);
}

function applyRootEvent(event: ParsedEvent, context: HistoryContext): string | undefined {
  const { id, at, record } = event;
  if (context.leases.has(record.lease_id)) return `lease ${record.lease_id} has more than one root record`;
  if (record.epoch !== context.highestEpoch + 1) return 'new lease epoch is not the next consecutive value';
  if (record.record_type === 'takeover') {
    const takeoverError = validateActiveTakeover(event, context);
    if (takeoverError) return takeoverError;
  } else if (context.previousLease && !context.previousLease.terminal) {
    return 'a new claim was posted before the previous lease was released or superseded';
  }
  if (record.record_type === 'claim' && record.epoch !== 1 && !context.previousLease?.terminal) {
    return 'a non-initial claim has no released predecessor';
  }
  if ('heartbeat_at' in record && Date.parse(record.heartbeat_at) > at) {
    return `heartbeat ${id} claims a time after its comment was posted`;
  }
  const state = makeLeaseState(id, at, record);
  context.leases.set(record.lease_id, state);
  context.byClaimId.set(id, state);
  context.highestEpoch = record.epoch;
  context.previousLease = state;
  return undefined;
}

function validateActiveTakeover(event: ParsedEvent, context: HistoryContext): string | undefined {
  if (event.record.record_type !== 'takeover' || event.record.state !== 'active') return 'invalid active takeover';
  const record = event.record;
  if (event.at < Date.parse(record.observation_ended_at)) return 'active takeover was posted before its observation window ended';
  const requested = findMatchingTakeoverRequest(event, context.events);
  if (!requested) return 'active takeover has no preceding matching request without intervening transitions';
  if (event.at - requested.at < 15 * 60 * 1000) return 'takeover request observation window is shorter than 15 minutes';
  const oldLease = context.byClaimId.get(record.supersedes_claim_comment_id);
  if (!oldLease || oldLease !== context.previousLease || oldLease.terminal || oldLease.expiry === null
    || oldLease.expiry > Date.parse(record.observed_expired_at)) return 'takeover does not identify the current expired lease';
  const ackAt = context.commentTimes.get(record.maintainer_ack_comment_id);
  if (!context.ids.has(record.maintainer_ack_comment_id) || ackAt === undefined || ackAt >= event.at) {
    return 'takeover maintainer acknowledgement comment is missing';
  }
  if (ackAt < Date.parse(record.observation_ended_at) || ackAt > Date.parse(record.claimed_at)) {
    return 'maintainer acknowledgement is outside the takeover observation and claim window';
  }
  oldLease.terminal = true;
  return undefined;
}

function findMatchingTakeoverRequest(event: ParsedEvent, events: ParsedEvent[]): ParsedEvent | undefined {
  if (event.record.record_type !== 'takeover' || event.record.state !== 'active') return undefined;
  const requests = events.filter((candidate) => isBefore(candidate, event) && matchesTakeoverRequest(candidate.record, event.record));
  for (const request of requests.reverse()) {
    if (!hasTransitionAfterRequest(request, event, event.record.supersedes_claim_comment_id, events)) return request;
  }
  return undefined;
}

function hasTransitionAfterRequest(
  request: ParsedEvent,
  active: ParsedEvent,
  priorClaimId: string,
  events: ParsedEvent[]
): boolean {
  return events.some((event) => isAfter(event, request) && isBefore(event, active) && referencesTransition(event.record, priorClaimId));
}

function referencesTransition(record: AgentClaimRecord, claimId: string): boolean {
  return (record.record_type === 'heartbeat' || record.record_type === 'release'
    || record.record_type === 'handoff' || record.record_type === 'supersede')
    && record.claim_comment_id === claimId;
}

function isBefore(left: ParsedEvent, right: ParsedEvent): boolean {
  return left.at < right.at || (left.at === right.at && compareIds(left.id, right.id) < 0);
}

function isAfter(left: ParsedEvent, right: ParsedEvent): boolean {
  return isBefore(right, left);
}

function matchesTakeoverRequest(candidate: AgentClaimRecord, active: AgentClaimRecord): boolean {
  if (candidate.record_type !== 'takeover' || candidate.state !== 'takeover-requested'
    || active.record_type !== 'takeover' || active.state !== 'active') return false;
  return candidate.lease_id === active.lease_id
    && candidate.actor_id === active.actor_id
    && candidate.github_login === active.github_login
    && candidate.epoch === active.epoch
    && candidate.branch === active.branch
    && candidate.supersedes_claim_comment_id === active.supersedes_claim_comment_id
    && candidate.observed_expired_at === active.observed_expired_at
    && candidate.observation_started_at === active.observation_started_at;
}

function applyTakeoverRequest(event: ParsedEvent, context: HistoryContext): string | undefined {
  if (event.record.record_type !== 'takeover' || event.record.state !== 'takeover-requested') return 'invalid takeover request';
  const record = event.record;
  if (event.at < Date.parse(record.observed_expired_at)
    || event.at < Date.parse(record.observation_started_at)) {
    return 'takeover request was posted before expiry or the observation window began';
  }
  const oldLease = context.byClaimId.get(record.supersedes_claim_comment_id);
  if (!oldLease || oldLease.terminal || oldLease.expiry === null
    || oldLease.expiry > Date.parse(record.observed_expired_at)) return 'takeover request does not identify an expired prior lease';
  if (record.epoch !== oldLease.root.epoch + 1) return 'takeover request epoch does not follow the prior lease';
  return undefined;
}

function applyTransition(event: ParsedEvent, context: HistoryContext): string | undefined {
  const { id, at, record } = event;
  if (record.record_type === 'claim' || record.record_type === 'takeover') return 'invalid transition record';
  const state = context.byClaimId.get(record.claim_comment_id);
  if (!state) return `transition ${id} references an unknown claim`;
  if (state.terminal) return `transition ${id} follows a terminal lease record`;
  if (!sameLease(state.root, record)) return `transition ${id} changes lease identity or epoch`;
  if (at < state.latestAt) return `transition ${id} is out of order`;
  if (record.record_type === 'heartbeat') {
    if (state.expiry !== null && at >= state.expiry) return `heartbeat ${id} was posted after lease expiry`;
    if (Date.parse(record.heartbeat_at) > at) return `heartbeat ${id} claims a time after its comment was posted`;
    const priorHeartbeat = 'heartbeat_at' in state.latest ? Date.parse(state.latest.heartbeat_at) : Number.NaN;
    if (state.expiry !== null && Number.isFinite(priorHeartbeat) && Date.parse(record.heartbeat_at) < priorHeartbeat) {
      return `heartbeat ${id} moves lease time backwards`;
    }
    state.expiry = expiryOf(record);
  } else state.terminal = true;
  state.latest = record;
  state.latestAt = at;
  context.previousLease = state;
  return undefined;
}

function makeLeaseState(id: string, at: number, record: AgentClaimRecord): LeaseState {
  return { claimId: id, root: record, latest: record, latestAt: at, expiry: expiryOf(record), terminal: false };
}

function summarizeHistory(context: HistoryContext, nowMs: number): AgentClaimHistoryResult {
  const live = [...context.leases.values()].filter((lease) => !lease.terminal && lease.expiry !== null && lease.expiry > nowMs);
  if (live.length > 1) return ambiguous('multiple active leases remain live');
  if (live.length === 1) return { status: 'active', claim_comment_id: live[0].claimId, record: live[0].latest };
  const latest = [...context.leases.values()].at(-1);
  if (!latest) return { status: 'unclaimed' };
  return latest.terminal
    ? { status: 'released', claim_comment_id: latest.claimId, record: latest.latest }
    : { status: 'expired', claim_comment_id: latest.claimId, record: latest.latest };
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
