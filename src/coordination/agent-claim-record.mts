/** Strict, side-effect-free parser for one manual agent-claim issue comment. */
export const AGENT_CLAIM_SCHEMA = 'archimate-js.agent-claim/v1' as const;

const SCHEMA_PREFIX = 'archimate-js.agent-claim/';
const MAX_LEASE_MS = 2 * 60 * 60 * 1000;
const MAX_WORK_AGE_MS = 30 * 60 * 1000;

interface CommonRecord {
  schema: typeof AGENT_CLAIM_SCHEMA;
  issue: number;
  actor_id: string;
  github_login: string;
  lease_id: string;
  epoch: number;
  branch: string;
}

interface SupersedesOptional {
  supersedes_claim_comment_id?: string | null;
}

interface ReackOptional {
  maintainer_reack_comment_id?: string | null;
}

export interface ClaimRecord extends CommonRecord, SupersedesOptional, ReackOptional {
  record_type: 'claim';
  claim_comment_id: null;
  state: 'active';
  claimed_at: string;
  heartbeat_at: string;
  expires_at: string;
  lease_started_at: string;
  last_work_observed_at: string;
}

export interface HeartbeatRecord extends CommonRecord, SupersedesOptional, ReackOptional {
  record_type: 'heartbeat';
  claim_comment_id: string;
  state: 'active';
  heartbeat_at: string;
  expires_at: string;
  lease_started_at: string;
  last_work_observed_at: string;
}

export interface ReleaseRecord extends CommonRecord, SupersedesOptional {
  record_type: 'release';
  claim_comment_id: string;
  state: 'released';
  released_at: string;
  lease_started_at?: string | null;
  last_work_observed_at?: string | null;
  reason?: string | null;
}

export interface SupersedeRecord extends CommonRecord {
  record_type: 'supersede';
  claim_comment_id: string;
  supersedes_claim_comment_id: string;
  state: 'superseded';
  superseded_at: string;
  reason: string;
  lease_started_at?: string | null;
  last_work_observed_at?: string | null;
}

export interface TakeoverRequestedRecord extends CommonRecord {
  record_type: 'takeover';
  claim_comment_id: null;
  supersedes_claim_comment_id: string;
  state: 'takeover-requested';
  observed_expired_at: string;
  observation_started_at: string;
  lease_started_at?: string | null;
  last_work_observed_at?: string | null;
  maintainer_reack_comment_id?: string | null;
}

export interface TakeoverActiveRecord extends CommonRecord, ReackOptional {
  record_type: 'takeover';
  claim_comment_id: null;
  supersedes_claim_comment_id: string;
  state: 'active';
  observed_expired_at: string;
  observation_started_at: string;
  observation_ended_at: string;
  maintainer_ack_comment_id: string;
  claimed_at: string;
  heartbeat_at: string;
  expires_at: string;
  lease_started_at: string;
  last_work_observed_at: string;
}

export interface HandoffRecord extends CommonRecord, SupersedesOptional {
  record_type: 'handoff';
  claim_comment_id: string;
  state: 'released';
  handoff_at: string;
  handoff_summary: string;
  commit_sha: string;
  changed_files: string[];
  checks: string[];
  risks: string[];
  lease_started_at?: string | null;
  last_work_observed_at?: string | null;
}

export type AgentClaimRecord =
  | ClaimRecord
  | HeartbeatRecord
  | ReleaseRecord
  | SupersedeRecord
  | TakeoverRequestedRecord
  | TakeoverActiveRecord
  | HandoffRecord;

export type AgentClaimParseResult =
  | { status: 'unrelated' }
  | { status: 'invalid'; reason: string }
  | { status: 'valid'; record: AgentClaimRecord };

interface RecordShape {
  required: readonly string[];
  optional: readonly string[];
  state: string;
}

const common = ['schema', 'record_type', 'issue', 'actor_id', 'github_login', 'lease_id', 'epoch', 'branch'];
const shapes: Record<string, RecordShape> = {
  claim: {
    required: [...common, 'claim_comment_id', 'state', 'claimed_at', 'heartbeat_at', 'expires_at', 'lease_started_at', 'last_work_observed_at'],
    optional: ['maintainer_reack_comment_id', 'supersedes_claim_comment_id'],
    state: 'active'
  },
  heartbeat: {
    required: [...common, 'claim_comment_id', 'state', 'heartbeat_at', 'expires_at', 'lease_started_at', 'last_work_observed_at'],
    optional: ['maintainer_reack_comment_id', 'supersedes_claim_comment_id'],
    state: 'active'
  },
  release: {
    required: [...common, 'claim_comment_id', 'state', 'released_at'],
    optional: ['lease_started_at', 'last_work_observed_at', 'supersedes_claim_comment_id', 'reason'],
    state: 'released'
  },
  supersede: {
    required: [...common, 'claim_comment_id', 'supersedes_claim_comment_id', 'state', 'superseded_at', 'reason'],
    optional: ['lease_started_at', 'last_work_observed_at'],
    state: 'superseded'
  },
  'takeover-requested': {
    required: [...common, 'claim_comment_id', 'supersedes_claim_comment_id', 'state', 'observed_expired_at', 'observation_started_at'],
    optional: ['lease_started_at', 'last_work_observed_at', 'maintainer_reack_comment_id'],
    state: 'takeover-requested'
  },
  'takeover-active': {
    required: [...common, 'claim_comment_id', 'supersedes_claim_comment_id', 'state', 'observed_expired_at', 'observation_started_at', 'observation_ended_at', 'maintainer_ack_comment_id', 'claimed_at', 'heartbeat_at', 'expires_at', 'lease_started_at', 'last_work_observed_at'],
    optional: ['maintainer_reack_comment_id'],
    state: 'active'
  },
  handoff: {
    required: [...common, 'claim_comment_id', 'state', 'handoff_at', 'handoff_summary', 'commit_sha', 'changed_files', 'checks', 'risks'],
    optional: ['lease_started_at', 'last_work_observed_at', 'supersedes_claim_comment_id'],
    state: 'released'
  }
};

const commentIdFields = new Set([
  'claim_comment_id', 'maintainer_reack_comment_id', 'maintainer_ack_comment_id', 'supersedes_claim_comment_id'
]);
const timestampFields = new Set([
  'claimed_at', 'heartbeat_at', 'expires_at', 'lease_started_at', 'last_work_observed_at',
  'released_at', 'superseded_at', 'observed_expired_at', 'observation_started_at',
  'observation_ended_at', 'handoff_at'
]);
const nonEmptyStringFields = new Set([
  'actor_id', 'github_login', 'lease_id', 'branch', 'reason', 'handoff_summary', 'commit_sha'
]);

/** Classifies prose, malformed protocol attempts, and exactly one valid record. */
export function parseAgentClaimComment(body: string, expectedIssue?: number): AgentClaimParseResult {
  const fences = [...body.matchAll(/```([^\r\n`]*)\r?\n([\s\S]*?)```/g)].map((match) => ({
    language: match[1].trim().toLowerCase(),
    source: match[2],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
  const candidates: Array<{ source: string; language: string }> = [];

  for (const fence of fences) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fence.source);
    } catch {
      if (fence.source.includes(SCHEMA_PREFIX)) candidates.push(fence);
      continue;
    }
    if (isRecord(parsed) && typeof parsed.schema === 'string' && parsed.schema.startsWith(SCHEMA_PREFIX)) {
      candidates.push(fence);
    }
  }

  const outsideText = removeFences(body, fences);
  if (outsideText.includes(SCHEMA_PREFIX)) return invalid('protocol record marker is outside a fenced JSON block');
  if (candidates.length === 0) return { status: 'unrelated' };
  if (candidates.length !== 1) return invalid('comment contains more than one protocol record');

  const candidate = candidates[0];
  if (candidate.language !== 'json') return invalid('protocol record fence must use the json language tag');
  let decoded: unknown;
  try {
    decoded = JSON.parse(candidate.source);
  } catch {
    return invalid('protocol record contains invalid JSON');
  }
  if (!isRecord(decoded)) return invalid('protocol record must be a JSON object');

  try {
    assertNoDuplicateKeys(candidate.source);
  } catch {
    return invalid('protocol record contains duplicate JSON object keys');
  }
  const validationError = validateRecord(decoded, expectedIssue);
  if (validationError) return invalid(validationError);
  return { status: 'valid', record: decoded as unknown as AgentClaimRecord };
}

function removeFences(body: string, fences: Array<{ start: number; end: number }>): string {
  let outside = '';
  let cursor = 0;
  for (const fence of fences) {
    outside += body.slice(cursor, fence.start);
    cursor = fence.end;
  }
  return outside + body.slice(cursor);
}

function validateRecord(record: Record<string, unknown>, expectedIssue?: number): string | undefined {
  if (record.schema !== AGENT_CLAIM_SCHEMA) return 'unsupported or missing schema';
  if (typeof record.record_type !== 'string') return 'record_type must be a string';
  const recordType = record.record_type;
  const shapeKey = recordType === 'takeover'
    ? record.state === 'active' ? 'takeover-active' : 'takeover-requested'
    : recordType;
  const shape = shapes[shapeKey];
  if (!shape) return 'record_type or takeover state is invalid';
  if (record.state !== shape.state) return 'state does not match record_type';

  const allowed = new Set([...shape.required, ...shape.optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return `unknown field: ${key}`;
  }
  for (const key of shape.required) {
    if (!(key in record)) return `missing required field: ${key}`;
  }
  for (const key of [...shape.required, ...shape.optional]) {
    const value = record[key];
    if (shape.optional.includes(key) && (value === undefined || value === null)) continue;
    const error = validateField(key, value);
    if (error) return error;
  }
  if (expectedIssue !== undefined && record.issue !== expectedIssue) return 'issue does not match expected issue number';
  const semanticError = validateRecordSemantics(record, recordType, shapeKey);
  return semanticError ?? validateTimeline(record, shapeKey);
}

function validateRecordSemantics(
  record: Record<string, unknown>,
  recordType: string,
  shapeKey: string
): string | undefined {
  if (recordType === 'claim' || recordType === 'takeover') {
    if (record.claim_comment_id !== null) return 'new claim and takeover records must set claim_comment_id to null';
  } else if (!isCommentId(record.claim_comment_id)) {
    return 'transition records must name the existing decimal claim_comment_id';
  }
  if (['claim', 'heartbeat', 'release', 'handoff'].includes(recordType)
    && record.supersedes_claim_comment_id !== undefined
    && record.supersedes_claim_comment_id !== null) {
    return 'supersedes_claim_comment_id must be null for this record_type';
  }
  if (recordType === 'supersede' && record.claim_comment_id !== record.supersedes_claim_comment_id) {
    return 'supersede claim_comment_id and supersedes_claim_comment_id must match';
  }
  if (['claim', 'takeover-active'].includes(shapeKey)
    && timestampValue(record.claimed_at) !== timestampValue(record.lease_started_at)) {
    return 'lease_started_at must equal claimed_at for a new lease';
  }
  if (shapeKey === 'heartbeat'
    && timestampValue(record.heartbeat_at) - timestampValue(record.lease_started_at) > 8 * 60 * 60 * 1000
    && !isCommentId(record.maintainer_reack_comment_id)) {
    return 'heartbeat beyond eight hours requires maintainer_reack_comment_id';
  }
  if (shapeKey.startsWith('takeover-')) {
    const observed = timestampValue(record.observed_expired_at);
    const start = timestampValue(record.observation_started_at);
    if (start < observed) return 'observation_started_at must not precede observed_expired_at';
    if (shapeKey === 'takeover-active') {
      const end = timestampValue(record.observation_ended_at);
      if (end - start < 15 * 60 * 1000) return 'takeover observation window must be at least 15 minutes';
      if (timestampValue(record.claimed_at) < end) return 'claimed_at must not precede observation_ended_at';
    }
  }
  return undefined;
}

function validateField(key: string, value: unknown): string | undefined {
  if (key === 'schema' && value !== AGENT_CLAIM_SCHEMA) return 'unsupported or missing schema';
  if (key === 'record_type' && !['claim', 'heartbeat', 'release', 'supersede', 'takeover', 'handoff'].includes(String(value))) {
    return 'record_type is invalid';
  }
  if (key === 'issue' || key === 'epoch') {
    if (!Number.isInteger(value) || (value as number) <= 0) return `${key} must be a positive integer`;
    return undefined;
  }
  if (key === 'claim_comment_id') {
    if (value === null) return undefined;
    return isCommentId(value) ? undefined : 'claim_comment_id must be null or a decimal string';
  }
  if (commentIdFields.has(key)) return isCommentId(value) ? undefined : `${key} must be a decimal string`;
  if (timestampFields.has(key)) return isUtcTimestamp(value) ? undefined : `${key} must be a UTC RFC 3339 timestamp ending in Z`;
  if (nonEmptyStringFields.has(key)) return isNonEmptyString(value) ? undefined : `${key} must be a non-empty string`;
  if (['changed_files', 'checks', 'risks'].includes(key)) {
    return Array.isArray(value) && value.every(isNonEmptyString) ? undefined : `${key} must be an array of non-empty strings`;
  }
  if (key === 'state' && typeof value !== 'string') return 'state must be a string';
  return undefined;
}

function validateTimeline(record: Record<string, unknown>, shapeKey: string): string | undefined {
  if (!['claim', 'heartbeat', 'takeover-active'].includes(shapeKey)) return undefined;
  const heartbeat = timestampValue(record.heartbeat_at);
  const expiry = timestampValue(record.expires_at);
  const leaseStart = timestampValue(record.lease_started_at);
  const lastWork = timestampValue(record.last_work_observed_at);
  if (expiry <= heartbeat || expiry - heartbeat > MAX_LEASE_MS) return 'expires_at must be after heartbeat_at and within two hours';
  if (leaseStart > heartbeat) return 'lease_started_at must not be after heartbeat_at';
  if (lastWork > heartbeat || heartbeat - lastWork > MAX_WORK_AGE_MS) {
    return 'last_work_observed_at must be no more than 30 minutes before heartbeat_at';
  }
  if (record.claimed_at !== undefined && timestampValue(record.claimed_at) > heartbeat) {
    return 'claimed_at must not be after heartbeat_at';
  }
  return undefined;
}

function timestampValue(value: unknown): number {
  return Date.parse(value as string);
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 19) === value.slice(0, 19);
}

function isCommentId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(reason: string): AgentClaimParseResult {
  return { status: 'invalid', reason };
}

function assertNoDuplicateKeys(source: string): void {
  new JsonKeyScanner(source).scan();
}

class JsonKeyScanner {
  private cursor = 0;

  constructor(private readonly source: string) {}

  scan(): void {
    this.readValue();
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.cursor] ?? '')) this.cursor += 1;
  }

  private readString(): string {
    const start = this.cursor;
    this.cursor += 1;
    while (this.cursor < this.source.length) {
      if (this.source[this.cursor] === '\\') this.cursor += 2;
      else if (this.source[this.cursor++] === '"') break;
    }
    return this.source.slice(start, this.cursor);
  }

  private readValue(): void {
    this.skipWhitespace();
    const current = this.source[this.cursor];
    if (current === '{') this.readObject();
    else if (current === '[') this.readArray();
    else if (current === '"') this.readString();
    else while (this.cursor < this.source.length && !/[\s,}\]]/.test(this.source[this.cursor])) this.cursor += 1;
  }

  private readObject(): void {
    this.cursor += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    while (this.source[this.cursor] !== '}') {
      const key = JSON.parse(this.readString()) as string;
      if (keys.has(key)) throw new Error('duplicate key');
      keys.add(key);
      this.skipWhitespace();
      this.cursor += 1;
      this.readValue();
      this.skipWhitespace();
      if (this.source[this.cursor] === ',') {
        this.cursor += 1;
        this.skipWhitespace();
      } else if (this.source[this.cursor] !== '}') {
        throw new Error('invalid JSON object');
      }
    }
    this.cursor += 1;
  }

  private readArray(): void {
    this.cursor += 1;
    this.skipWhitespace();
    while (this.source[this.cursor] !== ']') {
      this.readValue();
      this.skipWhitespace();
      if (this.source[this.cursor] === ',') {
        this.cursor += 1;
        this.skipWhitespace();
      } else if (this.source[this.cursor] !== ']') {
        throw new Error('invalid JSON array');
      }
    }
    this.cursor += 1;
  }
}
