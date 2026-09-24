import { classifyAutomergeCandidate, latestRunsByName } from './drain-agent-pr.mjs';

export const QUEUE_TITLE = 'Dependency maintenance queue';

export function classifyQueueCandidate({ pr, runs, repository }) {
  if (pr?.state !== 'open' || pr.user?.login !== 'dependabot[bot]') return { state: 'ignore' };
  if (pr.head?.repo?.full_name !== repository) return { state: 'ignore' };

  const latest = latestRunsByName(runs);
  if ([...latest.values()].some((run) => run.status !== 'completed')) return { state: 'running' };

  const failures = [...latest.values()]
    .filter((run) => !['success', 'skipped'].includes(run.conclusion))
    .map((run) => run.name)
    .sort();

  if (failures.length) return { state: 'blocked', failures };

  const automatic = classifyAutomergeCandidate(pr, repository);
  if (automatic.eligible && automatic.kind === 'dependabot') return { state: 'automatic' };

  return { state: 'manual', failures: [] };
}

export function selectQueue(candidates) {
  const queueable = candidates
    .filter((item) => ['blocked', 'manual'].includes(item.classification.state))
    .sort((a, b) => a.pr.number - b.pr.number);
  return { selected: queueable[0] ?? null, waiting: queueable.slice(1) };
}

function parseClaim(body) {
  const matches = String(body || '').matchAll(/\`\`\`json\s*([\s\S]*?)\`\`\`/g);
  const records = [];
  for (const match of matches) {
    try {
      const record = JSON.parse(match[1]);
      if (record?.schema === 'archimate-js.agent-claim/v1' && record.lease_id) records.push(record);
    } catch {
      // Ignore malformed human comments.
    }
  }
  return records;
}

export function hasLiveQueueClaim(comments, now = new Date()) {
  const latestByLease = new Map();
  for (const comment of comments) {
    for (const record of parseClaim(comment.body)) latestByLease.set(record.lease_id, record);
  }
  return [...latestByLease.values()].some((record) =>
    record.state === 'active' && record.expires_at && new Date(record.expires_at) > now
  );
}

function queueBody(selected, waiting) {
  const failureText = selected.classification.failures?.length
    ? selected.classification.failures.join(', ')
    : 'manual major/unknown dependency review';
  const waitingText = waiting.length
    ? waiting.map((item) => `- #${item.pr.number} — ${item.pr.title} (${item.classification.state})`).join('\n')
    : '- none';

  return `<!-- dependency-maintenance-queue:v1 -->
## Selected maintenance item

**PR #${selected.pr.number}: ${selected.pr.title}**

- Head: \`${selected.pr.head.sha}\`
- State: \`${selected.classification.state}\`
- Failure/decision fingerprint: \`${failureText}\`

Agents: claim **this queue issue**, never the Dependabot PR directly. Keep the claim until the remediation/supersession decision is complete, then release it using the normal \`archimate-js.agent-claim/v1\` protocol. Do not close this persistent queue issue.

## Suppressed waiting items

${waitingText}
`;
}

async function api(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function workflowRuns(repository, sha) {
  const response = await api(
    `/repos/${repository}/actions/runs?head_sha=${encodeURIComponent(sha)}&event=pull_request&per_page=100`
  );
  return response.workflow_runs || [];
}

async function queueIssue(repository) {
  const issues = await api(`/repos/${repository}/issues?state=all&per_page=100`);
  return issues.find((issue) => !issue.pull_request && issue.title?.endsWith(QUEUE_TITLE)) ?? null;
}

async function upsertQueue(repository, existing, selected, waiting) {
  const payload = { title: `[READY] ${QUEUE_TITLE}`, body: queueBody(selected, waiting), state: 'open' };
  if (existing) return api(`/repos/${repository}/issues/${existing.number}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  return api(`/repos/${repository}/issues`, { method: 'POST', body: JSON.stringify(payload) });
}

async function markIdle(repository, existing) {
  if (!existing) return;
  await api(`/repos/${repository}/issues/${existing.number}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: `[IDLE] ${QUEUE_TITLE}`,
      body: '<!-- dependency-maintenance-queue:v1 -->\nNo blocked or manual Dependabot maintenance item is waiting.',
      state: 'open'
    })
  });
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');

  const prs = await api(`/repos/${repository}/pulls?state=open&per_page=100`);
  const dependabot = prs.filter((pr) => pr.user?.login === 'dependabot[bot]');
  const candidates = [];
  for (const pr of dependabot) {
    const classification = classifyQueueCandidate({
      pr,
      runs: await workflowRuns(repository, pr.head.sha),
      repository
    });
    candidates.push({ pr, classification });
  }

  const existing = await queueIssue(repository);
  if (existing) {
    const comments = await api(`/repos/${repository}/issues/${existing.number}/comments?per_page=100`);
    if (hasLiveQueueClaim(comments)) {
      console.log(`Queue issue #${existing.number} has a live claim; preserving its selected item.`);
      return;
    }
  }

  const { selected, waiting } = selectQueue(candidates);
  if (!selected) {
    await markIdle(repository, existing);
    console.log('Dependency maintenance queue is idle.');
    return;
  }

  const issue = await upsertQueue(repository, existing, selected, waiting);
  console.log(`Dependency maintenance queue #${issue.number} selected Dependabot PR #${selected.pr.number}; ${waiting.length} item(s) suppressed.`);
}

if (process.argv[1]?.endsWith('dependency-maintenance-queue.mjs')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
