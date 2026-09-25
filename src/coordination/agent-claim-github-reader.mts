import {
  resolveAgentClaimHistory,
  type AgentClaimHistoryComment,
  type AgentClaimHistoryResult
} from './agent-claim-history.mjs';

const PAGE_SIZE = 100;
const MAX_COMMENT_PAGES = 100;

export type GithubIssueState = 'open' | 'closed';
export type ClaimHistoryStatus = AgentClaimHistoryResult['status'];

export interface GithubClaimSnapshotOptions {
  owner: string;
  repository: string;
  issueNumber: number;
  fetch: typeof globalThis.fetch;
  apiBaseUrl?: string;
  now?: string | number;
}

export interface ActiveClaimSummary {
  status: 'active';
  claimCommentId: string;
  actorId: string;
  githubLogin: string;
  leaseId: string;
  epoch: number;
  branch: string;
  expiresAt: string;
}

export type SanitizedClaimStatus =
  | ActiveClaimSummary
  | { status: Exclude<ClaimHistoryStatus, 'active'> };

export interface GithubClaimSnapshot {
  issueNumber: number;
  issueState: GithubIssueState;
  claim: SanitizedClaimStatus;
}

type ReaderErrorCode = 'AGENT_CLAIM_GITHUB_READER_INVALID_INPUT'
  | 'AGENT_CLAIM_GITHUB_READER_HTTP_ERROR'
  | 'AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE'
  | 'AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR';

const ERROR_MESSAGES: Record<ReaderErrorCode, string> = {
  AGENT_CLAIM_GITHUB_READER_INVALID_INPUT: 'GitHub claim snapshot input is invalid.',
  AGENT_CLAIM_GITHUB_READER_HTTP_ERROR: 'GitHub claim snapshot request failed.',
  AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE: 'GitHub claim snapshot response is invalid.',
  AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR: 'GitHub claim comment pagination is invalid.'
};

function fail(code: ReaderErrorCode): never {
  const error = new TypeError(ERROR_MESSAGES[code]);
  Object.assign(error, { code });
  throw error;
}

function repositoryPart(value: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(value) && value !== '.' && value !== '..';
}

function apiRootFor(value: string | undefined): URL {
  let root: URL;
  try { root = new URL(value ?? 'https://api.github.com'); }
  catch { return fail('AGENT_CLAIM_GITHUB_READER_INVALID_INPUT'); }
  if (root.protocol !== 'https:' || root.username || root.password || root.search || root.hash) {
    return fail('AGENT_CLAIM_GITHUB_READER_INVALID_INPUT');
  }
  root.pathname = `${root.pathname.replace(/\/+$/, '')}/`;
  return root;
}

function commentEndpoint(root: URL, owner: string, repository: string, issueNumber: number): URL {
  return new URL(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}` +
    `/issues/${issueNumber}/comments?per_page=${PAGE_SIZE}&page=1`, root);
}

function issueEndpoint(root: URL, owner: string, repository: string, issueNumber: number): URL {
  return new URL(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}` +
    `/issues/${issueNumber}`, root);
}

async function getJson(fetcher: typeof globalThis.fetch, url: URL): Promise<{ body: unknown; link: string | null }> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'GET', redirect: 'error',
      headers: { accept: 'application/vnd.github+json' } });
  } catch {
    return fail('AGENT_CLAIM_GITHUB_READER_HTTP_ERROR');
  }
  if (response.url) {
    let finalUrl: URL;
    try { finalUrl = new URL(response.url); }
    catch { return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE'); }
    if (finalUrl.href !== url.href) return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE');
  }
  if (!response.ok) return fail('AGENT_CLAIM_GITHUB_READER_HTTP_ERROR');
  try { return { body: await response.json() as unknown, link: response.headers.get('link') }; }
  catch { return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE'); }
}

function issueState(value: unknown, expectedNumber: number): GithubIssueState {
  if (!value || typeof value !== 'object') return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE');
  const issue = value as Record<string, unknown>;
  if (issue.number !== expectedNumber || !['open', 'closed'].includes(String(issue.state)) ||
      Object.hasOwn(issue, 'pull_request')) {
    return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE');
  }
  return issue.state as GithubIssueState;
}

function issueComments(value: unknown): AgentClaimHistoryComment[] {
  if (!Array.isArray(value)) return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE');
    const comment = entry as Record<string, unknown>;
    const id = typeof comment.id === 'number' && Number.isSafeInteger(comment.id) && comment.id > 0
      ? String(comment.id) : typeof comment.id === 'string' && /^[1-9]\d*$/.test(comment.id)
        ? comment.id : undefined;
    if (!id || !isUtcTimestamp(comment.created_at) ||
        typeof comment.body !== 'string') {
      return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE');
    }
    return { id, created_at: comment.created_at, body: comment.body };
  });
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 19) === value.slice(0, 19);
}

function splitLinkEntries(link: string): string[] {
  const entries: string[] = [];
  let start = 0;
  let angle = false;
  let quoted = false;
  for (let index = 0; index < link.length; index++) {
    const character = link[index];
    if (character === '"' && link[index - 1] !== '\\' && !angle) quoted = !quoted;
    if (!quoted && character === '<') angle = true;
    else if (!quoted && character === '>') angle = false;
    else if (!quoted && !angle && character === ',') {
      entries.push(link.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted || angle) return fail('AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR');
  entries.push(link.slice(start).trim());
  if (entries.some((entry) => !entry)) return fail('AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR');
  return entries;
}

function nextPage(link: string | null, current: URL, endpoint: URL, origin: string): URL | undefined {
  if (!link) return undefined;
  const entries = splitLinkEntries(link).map((entry) => {
    const match = /^<([^>]+)>\s*(.*)$/.exec(entry);
    const relations = match ? [...match[2].matchAll(/(?:^|;)\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/gi)] : [];
    if (!match || relations.length !== 1) return fail('AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR');
    const relation = relations[0][1] ?? relations[0][2];
    return { target: match[1], relations: relation.split(/\s+/) };
  });
  const next = entries.find((entry) => entry.relations.includes('next'));
  if (!next) return undefined;
  let url: URL;
  try { url = new URL(next.target, current); }
  catch { return fail('AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR'); }
  if (url.origin !== origin || url.pathname !== endpoint.pathname || url.username || url.password ||
      url.hash || url.searchParams.get('per_page') !== String(PAGE_SIZE) ||
      !/^[1-9]\d*$/.test(url.searchParams.get('page') ?? '') ||
      url.searchParams.getAll('page').length !== 1 || url.searchParams.getAll('per_page').length !== 1 ||
      [...url.searchParams.keys()].some((key) => key !== 'page' && key !== 'per_page') ||
      Number(url.searchParams.get('page')) !== Number(current.searchParams.get('page')) + 1) {
    return fail('AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR');
  }
  return url;
}

function sanitizedClaim(result: AgentClaimHistoryResult): SanitizedClaimStatus {
  if (result.status !== 'active') return { status: result.status };
  const record = result.record;
  if (!('expires_at' in record)) return { status: 'ambiguous' };
  return {
    status: 'active', claimCommentId: result.claim_comment_id, actorId: record.actor_id,
    githubLogin: record.github_login, leaseId: record.lease_id, epoch: record.epoch,
    branch: record.branch, expiresAt: record.expires_at
  };
}

/** Read a complete issue claim history; the sanitized result is never write authorization. */
export async function readGithubClaimSnapshot(
  options: GithubClaimSnapshotOptions
): Promise<GithubClaimSnapshot> {
  if (!repositoryPart(options.owner) || !repositoryPart(options.repository) ||
      !Number.isSafeInteger(options.issueNumber) || options.issueNumber <= 0 ||
      typeof options.fetch !== 'function') return fail('AGENT_CLAIM_GITHUB_READER_INVALID_INPUT');
  const root = apiRootFor(options.apiBaseUrl);
  const issue = issueEndpoint(root, options.owner, options.repository, options.issueNumber);
  const commentsUrl = commentEndpoint(root, options.owner, options.repository, options.issueNumber);
  const state = issueState((await getJson(options.fetch, issue)).body, options.issueNumber);
  const comments: AgentClaimHistoryComment[] = [];
  const visited = new Set<string>();
  const origin = root.origin;
  let page: URL | undefined = commentsUrl;
  for (let count = 0; page && count < MAX_COMMENT_PAGES; count++) {
    if (visited.has(page.href)) return fail('AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR');
    visited.add(page.href);
    const response = await getJson(options.fetch, page);
    const pageComments = issueComments(response.body);
    if (pageComments.length > PAGE_SIZE) return fail('AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE');
    comments.push(...pageComments);
    const next = nextPage(response.link, page, commentsUrl, origin);
    page = next;
  }
  if (page) return fail('AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR');
  const claim = resolveAgentClaimHistory(comments, options.issueNumber, options.now ?? Date.now());
  return { issueNumber: options.issueNumber, issueState: state, claim: sanitizedClaim(claim) };
}
