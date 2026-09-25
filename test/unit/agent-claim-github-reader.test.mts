/* SYNTHETIC provenance: fabricated GitHub REST payloads and claim records. */
import { expect, it } from 'vitest';
import { readGithubClaimSnapshot } from '../../src/coordination/agent-claim-github-reader.mjs';

const base = 'https://api.synthetic.invalid';
const commentPath = '/repos/example-owner/example-repository/issues/334/comments';

function json(body: unknown, link?: string, status = 200): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (link) headers.set('link', link);
  return new Response(JSON.stringify(body), { status, headers });
}

function claimComment(id: number): Record<string, unknown> {
  const record = {
    schema: 'archimate-js.agent-claim/v1', record_type: 'claim', issue: 334,
    claim_comment_id: null, actor_id: 'synthetic-run', github_login: 'example-bot',
    lease_id: 'synthetic-lease', epoch: 1, claimed_at: '2026-09-25T10:00:00Z',
    heartbeat_at: '2026-09-25T10:00:00Z', expires_at: '2026-09-25T12:00:00Z',
    lease_started_at: '2026-09-25T10:00:00Z', last_work_observed_at: '2026-09-25T10:00:00Z',
    supersedes_claim_comment_id: null, branch: 'agent/synthetic/issue-334', state: 'active'
  };
  return { id, created_at: '2026-09-25T10:00:01Z',
    body: `Synthetic claim record.\n\n\`\`\`json\n${JSON.stringify(record)}\n\`\`\`` };
}

function options(fetch: typeof globalThis.fetch) {
  return { owner: 'example-owner', repository: 'example-repository', issueNumber: 334,
    fetch, apiBaseUrl: base, now: '2026-09-25T10:30:00Z' };
}

it('reads every comment page and returns only sanitized active claim fields', async () => {
  const calls: Array<{ url: string; method: string | undefined; authorization: string | null }> = [];
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method, authorization: new Headers(init?.headers).get('authorization') });
    if (url.endsWith('/issues/334')) return json({ number: 334, state: 'open', title: 'SYNTHETIC PRIVATE TITLE' });
    if (url.endsWith('comments?per_page=100&page=1')) {
      return json([{ id: 12, created_at: '2026-09-25T09:00:00Z', body: 'SYNTHETIC PRIVATE COMMENT' }],
        `<${base}${commentPath}?per_page=100&page=1>; rel="prev", ` +
        `<${base}${commentPath}?per_page=100&page=2>; title="later page"; rel="next"`);
    }
    if (url.endsWith('comments?per_page=100&page=2')) return json([claimComment(13)]);
    throw new Error('Unexpected synthetic request.');
  };

  const result = await readGithubClaimSnapshot(options(fetcher));
  expect(calls.map(({ url }) => url)).toHaveLength(3);
  expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  expect(calls.every(({ authorization }) => authorization === null)).toBe(true);
  expect(result).toEqual({ issueNumber: 334, issueState: 'open', claim: {
    status: 'active', claimCommentId: '13', actorId: 'synthetic-run',
    githubLogin: 'example-bot', leaseId: 'synthetic-lease', epoch: 1,
    branch: 'agent/synthetic/issue-334', expiresAt: '2026-09-25T12:00:00Z'
  } });
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC PRIVATE');
  expect(JSON.stringify(result)).not.toContain('body');
});

it('reports closed issues and unclaimed status without exposing response fields', async () => {
  const fetcher: typeof globalThis.fetch = async (input) => String(input).endsWith('/issues/334')
    ? json({ number: 334, state: 'closed', title: 'SYNTHETIC PRIVATE TITLE' }) : json([]);
  expect(await readGithubClaimSnapshot(options(fetcher))).toEqual({
    issueNumber: 334, issueState: 'closed', claim: { status: 'unclaimed' }
  });
});

it('fails closed on incomplete HTTP and malformed JSON responses without leaking bodies', async () => {
  const denied: typeof globalThis.fetch = async () => json({ message: 'SYNTHETIC PRIVATE RESPONSE' }, undefined, 403);
  await expect(readGithubClaimSnapshot(options(denied))).rejects.toMatchObject({
    code: 'AGENT_CLAIM_GITHUB_READER_HTTP_ERROR'
  });
  const malformed: typeof globalThis.fetch = async () => new Response('SYNTHETIC PRIVATE BODY {');
  await expect(readGithubClaimSnapshot(options(malformed))).rejects.toMatchObject({
    code: 'AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE'
  });
  try { await readGithubClaimSnapshot(options(denied)); }
  catch (error) { expect(String(error)).not.toContain('SYNTHETIC PRIVATE RESPONSE'); }
});

it('rejects redirected responses and zone-less comment timestamps', async () => {
  const redirectedResponse = json({ number: 334, state: 'open' });
  Object.defineProperty(redirectedResponse, 'url', { value: `${base}/redirected` });
  const redirected: typeof globalThis.fetch = async (_input, init) => {
    expect(init?.redirect).toBe('error');
    return redirectedResponse;
  };
  await expect(readGithubClaimSnapshot(options(redirected))).rejects.toMatchObject({
    code: 'AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE'
  });

  const localTime: typeof globalThis.fetch = async (input) => String(input).endsWith('/issues/334')
    ? json({ number: 334, state: 'open' })
    : json([{ ...claimComment(15), created_at: '2026-09-25T10:00:01' }]);
  await expect(readGithubClaimSnapshot(options(localTime))).rejects.toMatchObject({
    code: 'AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE'
  });
});

it('rejects unsafe, looping, and unbounded pagination without following it', async () => {
  const unsafe: typeof globalThis.fetch = async (input) => String(input).endsWith('/issues/334')
    ? json({ number: 334, state: 'open' })
    : json([], '<https://other.synthetic.invalid/comments?page=2&per_page=100>; rel="next"');
  await expect(readGithubClaimSnapshot(options(unsafe))).rejects.toMatchObject({
    code: 'AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR'
  });
  const skippedPage: typeof globalThis.fetch = async (input) => String(input).endsWith('/issues/334')
    ? json({ number: 334, state: 'open' })
    : json([], `<${base}${commentPath}?per_page=100&page=3>; rel="next"`);
  await expect(readGithubClaimSnapshot(options(skippedPage))).rejects.toMatchObject({
    code: 'AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR'
  });

  let commentCalls = 0;
  const looping: typeof globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/issues/334')) return json({ number: 334, state: 'open' });
    commentCalls++;
    return json([], `<${base}${commentPath}?per_page=100&page=1>; rel="next"`);
  };
  await expect(readGithubClaimSnapshot(options(looping))).rejects.toMatchObject({
    code: 'AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR'
  });
  expect(commentCalls).toBe(1);

  let pageRequests = 0;
  const unbounded: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/issues/334')) return json({ number: 334, state: 'open' });
    pageRequests++;
    const nextPage = Number(url.searchParams.get('page')) + 1;
    return json([], `<${base}${commentPath}?per_page=100&page=${nextPage}>; rel="next"`);
  };
  await expect(readGithubClaimSnapshot(options(unbounded))).rejects.toMatchObject({
    code: 'AGENT_CLAIM_GITHUB_READER_PAGINATION_ERROR'
  });
  expect(pageRequests).toBe(100);
});

it('returns ambiguous for malformed claim history without exposing parser details', async () => {
  const fetcher: typeof globalThis.fetch = async (input) => String(input).endsWith('/issues/334')
    ? json({ number: 334, state: 'open' })
    : json([{ id: 14, created_at: '2026-09-25T10:00:00Z', body: 'archimate-js.agent-claim/v1 SYNTHETIC PRIVATE BODY' }]);
  const result = await readGithubClaimSnapshot(options(fetcher));
  expect(result.claim).toEqual({ status: 'ambiguous' });
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC PRIVATE');
});

it('rejects issue identity mismatches and pull request payloads', async () => {
  for (const payload of [
    { number: 999, state: 'open' },
    { number: 334, state: 'open', pull_request: { url: 'https://example.invalid' } }
  ]) {
    const fetcher: typeof globalThis.fetch = async () => json(payload);
    await expect(readGithubClaimSnapshot(options(fetcher))).rejects.toMatchObject({
      code: 'AGENT_CLAIM_GITHUB_READER_INVALID_RESPONSE'
    });
  }
});
