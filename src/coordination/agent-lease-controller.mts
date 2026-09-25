import {
  parseAgentClaimComment,
  type AgentClaimRecord,
  type ReleaseRecord
} from './agent-claim-record.mjs';
import {
  resolveAgentClaimHistory,
  type AgentClaimHistoryComment,
  type AgentClaimHistoryResult
} from './agent-claim-history.mjs';
import {
  matchesAgentLeaseHistoryFence,
  proposeAgentLeaseOperation,
  type AgentLeaseAudit,
  type AgentLeaseOperation,
  type AgentLeaseOperationResult,
  type AgentLeaseToken
} from './agent-lease-operations.mjs';

export interface AgentLeaseIssueSeed {
  issue: number;
  issue_state?: 'open' | 'closed';
  comments?: readonly AgentClaimHistoryComment[];
  current_assignees?: readonly string[];
}

export interface AgentLeaseClaimInput {
  issue: number;
  now: string;
  actor_id: string;
  github_login: string;
  lease_id: string;
  branch: string;
}

export interface AgentLeaseHeartbeatInput extends AgentLeaseToken {
  issue: number;
  now: string;
  last_work_observed_at: string;
}

export interface AgentLeaseReleaseInput extends AgentLeaseToken {
  issue: number;
  now: string;
}

export interface AgentLeaseTakeoverRequestInput extends Omit<AgentLeaseClaimInput, 'now'> {
  now: string;
}

export interface AgentLeaseTakeoverFinalizeInput extends Omit<AgentLeaseToken, 'claim_comment_id'> {
  issue: number;
  now: string;
  supersedes_claim_comment_id: string;
  observation_ended_at: string;
  maintainer_ack_comment_id: string;
}

export interface AgentLeaseReconcileInput {
  issue: number;
  now: string;
  issue_state: 'open' | 'closed';
  current_assignees?: readonly string[];
}

export interface AgentLeaseControllerSnapshot {
  issue_state: 'open' | 'closed';
  current_assignees: readonly string[];
  comments: readonly AgentClaimHistoryComment[];
  history: AgentClaimHistoryResult;
}

interface AgentLeaseIssueState {
  issue_state: 'open' | 'closed';
  current_assignees: string[];
  comments: AgentClaimHistoryComment[];
  next_comment_id: bigint;
}

type OperationFailure = Extract<AgentLeaseOperationResult, { status: 'rejected' | 'no-op' }>;

export type AgentLeaseControllerOperation =
  | 'claim'
  | 'heartbeat'
  | 'release'
  | 'takeover-request'
  | 'takeover-active'
  | 'reconcile-closed'
  | 'sweep-expired';

export type AgentLeaseControllerResult =
  | OperationFailure
  | {
    status: 'applied';
    operation: AgentLeaseControllerOperation;
    record: AgentClaimRecord;
    comment: AgentClaimHistoryComment;
    audit: AgentLeaseAudit;
    token?: AgentLeaseToken;
  };

/** Serialized, process-local lease controller. It performs no external IO. */
export class InMemoryAgentLeaseController {
  private readonly issues = new Map<number, AgentLeaseIssueState>();
  private readonly tails = new Map<number, Promise<void>>();

  constructor(seeds: readonly AgentLeaseIssueSeed[] = []) {
    for (const seed of seeds) {
      if (!isIssue(seed.issue) || this.issues.has(seed.issue)) {
        throw new Error(`Invalid or duplicate issue seed: ${seed.issue}`);
      }
      this.issues.set(seed.issue, createIssueState(seed));
    }
  }

  claim(input: AgentLeaseClaimInput): Promise<AgentLeaseControllerResult> {
    return this.runResult(input.issue, (state) => this.applyOperation(input.issue, input.now, state, {
      type: 'claim',
      actor_id: input.actor_id,
      github_login: input.github_login,
      lease_id: input.lease_id,
      branch: input.branch
    }));
  }

  heartbeat(input: AgentLeaseHeartbeatInput): Promise<AgentLeaseControllerResult> {
    return this.runResult(input.issue, (state) => this.applyOperation(input.issue, input.now, state, {
      type: 'heartbeat',
      ...leaseToken(input),
      last_work_observed_at: input.last_work_observed_at
    }));
  }

  renew(input: AgentLeaseHeartbeatInput): Promise<AgentLeaseControllerResult> {
    return this.heartbeat(input);
  }

  release(input: AgentLeaseReleaseInput): Promise<AgentLeaseControllerResult> {
    return this.runResult(input.issue, (state) => this.applyOperation(input.issue, input.now, state, {
      type: 'release',
      ...leaseToken(input)
    }));
  }

  requestTakeover(input: AgentLeaseTakeoverRequestInput): Promise<AgentLeaseControllerResult> {
    return this.runResult(input.issue, (state) => this.applyOperation(input.issue, input.now, state, {
      type: 'takeover-request',
      actor_id: input.actor_id,
      github_login: input.github_login,
      lease_id: input.lease_id,
      branch: input.branch
    }));
  }

  finalizeTakeover(input: AgentLeaseTakeoverFinalizeInput): Promise<AgentLeaseControllerResult> {
    return this.runResult(input.issue, (state) => this.applyOperation(input.issue, input.now, state, {
      type: 'takeover-active',
      actor_id: input.actor_id,
      github_login: input.github_login,
      lease_id: input.lease_id,
      epoch: input.epoch,
      branch: input.branch,
      supersedes_claim_comment_id: input.supersedes_claim_comment_id,
      observation_ended_at: input.observation_ended_at,
      maintainer_ack_comment_id: input.maintainer_ack_comment_id
    }));
  }

  reconcile(input: AgentLeaseReconcileInput): Promise<AgentLeaseControllerResult> {
    return this.runResult(input.issue, (state) => {
      state.issue_state = input.issue_state;
      state.current_assignees = sortedUnique(input.current_assignees ?? state.current_assignees);
      return this.applyOperation(input.issue, input.now, state, {
        type: 'reconcile-closed',
        current_assignees: state.current_assignees
      });
    });
  }

  async sweep(now: string): Promise<readonly AgentLeaseControllerResult[]> {
    const issues = [...this.issues.keys()].sort((left, right) => left - right);
    return Promise.all(issues.map((issue) => this.run(issue, (state) => this.sweepIssue(issue, now, state))));
  }

  inspect(issue: number, now: string): Promise<AgentLeaseControllerSnapshot> {
    if (!isIssue(issue)) return Promise.reject(new RangeError(`Invalid issue number: ${issue}`));
    return this.run(issue, (state) => ({
      issue_state: state.issue_state,
      current_assignees: [...state.current_assignees],
      comments: state.comments.map(copyComment),
      history: resolveAgentClaimHistory(state.comments, issue, now)
    }));
  }

  private applyOperation(
    issue: number,
    now: string,
    state: AgentLeaseIssueState,
    operation: AgentLeaseOperation
  ): AgentLeaseControllerResult {
    const proposal = proposeAgentLeaseOperation({
      issue,
      issue_state: state.issue_state,
      comments: state.comments,
      now,
      operation
    });
    if (proposal.status !== 'proposed') return proposal;
    if (!matchesAgentLeaseHistoryFence(proposal.expected_history, state.comments)) {
      return failed('AMBIGUOUS_HISTORY');
    }
    return this.appendRecord(state, now, proposal.operation, proposal.record, proposal.audit);
  }

  private sweepIssue(
    issue: number,
    now: string,
    state: AgentLeaseIssueState
  ): AgentLeaseControllerResult {
    if (!isUtcTimestamp(now)) return failed('INVALID_TIME');
    const history = resolveAgentClaimHistory(state.comments, issue, now);
    if (history.status === 'ambiguous') return failed('AMBIGUOUS_HISTORY');
    if (state.issue_state === 'closed' && history.status === 'active') {
      return this.applyOperation(issue, now, state, {
        type: 'reconcile-closed',
        current_assignees: state.current_assignees
      });
    }
    if (history.status !== 'expired') {
      return noOp(history.status === 'active' ? 'ACTIVE_LEASE' : 'NO_ACTIVE_LEASE');
    }
    const record = expiredRelease(issue, now, history);
    return this.appendRecord(
      state,
      now,
      'sweep-expired',
      record,
      { reason_code: 'EXPIRED_LEASE_RECONCILED', action: 'append-comment' }
    );
  }

  private appendRecord(
    state: AgentLeaseIssueState,
    now: string,
    operation: AgentLeaseControllerOperation,
    record: AgentClaimRecord,
    audit: AgentLeaseAudit
  ): AgentLeaseControllerResult {
    const body = `\`\`\`json\n${JSON.stringify(record)}\n\`\`\``;
    const parsed = parseAgentClaimComment(body, record.issue);
    if (parsed.status !== 'valid') return failed('INVALID_TRANSITION');
    const comment = { id: String(state.next_comment_id), created_at: now, body };
    state.next_comment_id += 1n;
    state.comments.push(comment);
    return {
      status: 'applied',
      operation,
      record: parsed.record,
      comment: copyComment(comment),
      audit,
      token: activeToken(comment.id, parsed.record)
    };
  }

  private runResult(
    issue: number,
    operation: (state: AgentLeaseIssueState) => AgentLeaseControllerResult
  ): Promise<AgentLeaseControllerResult> {
    if (!isIssue(issue)) return Promise.resolve(failed('INVALID_REQUEST'));
    return this.run(issue, operation);
  }

  private run<T>(
    issue: number,
    operation: (state: AgentLeaseIssueState) => T | Promise<T>
  ): Promise<T> {
    const state = this.getIssue(issue);
    const previous = this.tails.get(issue) ?? Promise.resolve();
    const current = previous.then(() => operation(state));
    const tail = current.then(() => undefined, () => undefined);
    this.tails.set(issue, tail);
    return current.finally(() => {
      if (this.tails.get(issue) === tail) this.tails.delete(issue);
    });
  }

  private getIssue(issue: number): AgentLeaseIssueState {
    const existing = this.issues.get(issue);
    if (existing) return existing;
    const created = createIssueState({ issue });
    this.issues.set(issue, created);
    return created;
  }
}

function createIssueState(seed: AgentLeaseIssueSeed): AgentLeaseIssueState {
  const comments = (seed.comments ?? []).map(copyComment);
  return {
    issue_state: seed.issue_state ?? 'open',
    current_assignees: sortedUnique(seed.current_assignees ?? []),
    comments,
    next_comment_id: nextCommentId(comments)
  };
}

function expiredRelease(
  issue: number,
  now: string,
  history: Extract<AgentClaimHistoryResult, { status: 'expired' }>
): ReleaseRecord {
  return {
    schema: history.record.schema,
    record_type: 'release',
    issue,
    claim_comment_id: history.claim_comment_id,
    actor_id: history.record.actor_id,
    github_login: history.record.github_login,
    lease_id: history.record.lease_id,
    epoch: history.record.epoch,
    released_at: now,
    supersedes_claim_comment_id: null,
    branch: history.record.branch,
    state: 'released'
  };
}

function activeToken(commentId: string, record: AgentClaimRecord): AgentLeaseToken | undefined {
  if (record.record_type !== 'claim' && record.record_type !== 'heartbeat'
    && !(record.record_type === 'takeover' && record.state === 'active')) return undefined;
  return {
    claim_comment_id: record.claim_comment_id ?? commentId,
    actor_id: record.actor_id,
    github_login: record.github_login,
    lease_id: record.lease_id,
    epoch: record.epoch,
    branch: record.branch
  };
}

function leaseToken(input: AgentLeaseToken): AgentLeaseToken {
  return {
    claim_comment_id: input.claim_comment_id,
    actor_id: input.actor_id,
    github_login: input.github_login,
    lease_id: input.lease_id,
    epoch: input.epoch,
    branch: input.branch
  };
}

function nextCommentId(comments: readonly AgentClaimHistoryComment[]): bigint {
  const ids = comments.filter((comment) => /^[1-9]\d*$/.test(comment.id)).map((comment) => BigInt(comment.id));
  return (ids.length ? ids.reduce((highest, id) => id > highest ? id : highest) : 0n) + 1n;
}

function failed(code: OperationFailure['code']): OperationFailure {
  return { status: 'rejected', code, audit: { reason_code: code, action: 'no-write' } };
}

function noOp(code: OperationFailure['code']): OperationFailure {
  return { status: 'no-op', code, audit: { reason_code: code, action: 'no-write' } };
}

function copyComment(comment: AgentClaimHistoryComment): AgentClaimHistoryComment {
  return { id: comment.id, created_at: comment.created_at, body: comment.body };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function isIssue(issue: number): boolean {
  return Number.isInteger(issue) && issue > 0;
}

function isUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}
