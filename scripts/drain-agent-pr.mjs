const REQUIRED_WORKFLOWS = new Set(['CI', 'Automated security analysis']);
const GOOD_OPTIONAL_CONCLUSIONS = new Set(['success', 'skipped']);

export function latestRunsByName(runs) {
  const latest = new Map();
  for (const run of runs) {
    const current = latest.get(run.name);
    if (!current || Number(run.id) > Number(current.id)) latest.set(run.name, run);
  }
  return latest;
}

export function evaluateDrainState({ pr, runs, repository }) {
  if (!pr || pr.state !== 'open') return { action: 'skip', reason: 'pr-not-open' };
  if (pr.draft) return { action: 'wait', reason: 'pr-is-draft' };
  if (pr.base?.ref !== 'main') return { action: 'skip', reason: 'non-main-base' };
  if (pr.head?.repo?.full_name !== repository) return { action: 'skip', reason: 'fork-pr' };
  if (!pr.head?.ref?.startsWith('agent/')) return { action: 'skip', reason: 'non-agent-branch' };
  if ((pr.labels || []).some((label) => label.name === 'no-auto-merge')) {
    return { action: 'skip', reason: 'opt-out-label' };
  }
  if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
    return { action: 'block', reason: 'not-mergeable' };
  }

  const latest = latestRunsByName(runs);
  for (const workflow of REQUIRED_WORKFLOWS) {
    const run = latest.get(workflow);
    if (!run) return { action: 'wait', reason: `missing-${workflow}` };
    if (run.status !== 'completed') return { action: 'wait', reason: `running-${workflow}` };
    if (run.conclusion !== 'success') return { action: 'block', reason: `failed-${workflow}:${run.conclusion}` };
  }

  for (const run of latest.values()) {
    if (run.status !== 'completed') return { action: 'wait', reason: `running-${run.name}` };
    if (!GOOD_OPTIONAL_CONCLUSIONS.has(run.conclusion)) {
      return { action: 'block', reason: `failed-${run.name}:${run.conclusion}` };
    }
  }

  return { action: 'merge', reason: 'all-exact-head-workflows-green' };
}

async function api(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

async function resolvePrNumber(repository) {
  const argument = Number(process.argv[2] || process.env.PR_NUMBER);
  if (Number.isInteger(argument) && argument > 0) return argument;

  const sha = process.env.HEAD_SHA;
  if (!sha) throw new Error('PR number or HEAD_SHA is required');
  const prs = await api(`/repos/${repository}/commits/${sha}/pulls`);
  const matching = prs.filter((pr) => pr.state === 'open');
  if (matching.length !== 1) {
    throw new Error(`Expected exactly one open PR for ${sha}; found ${matching.length}`);
  }
  return matching[0].number;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');

  const prNumber = await resolvePrNumber(repository);
  const pr = await api(`/repos/${repository}/pulls/${prNumber}`);
  const runsResponse = await api(
    `/repos/${repository}/actions/runs?head_sha=${encodeURIComponent(pr.head.sha)}&event=pull_request&per_page=100`
  );
  const decision = evaluateDrainState({ pr, runs: runsResponse.workflow_runs || [], repository });
  console.log(`PR #${prNumber}: ${decision.action} (${decision.reason})`);

  if (decision.action !== 'merge') return;

  const result = await api(`/repos/${repository}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ merge_method: 'squash', sha: pr.head.sha })
  });
  if (!result?.merged) throw new Error(`Merge rejected for PR #${prNumber}: ${result?.message || 'unknown reason'}`);
  console.log(`Merged PR #${prNumber} at exact HEAD ${pr.head.sha}.`);
}

if (process.argv[1] && process.argv[1].endsWith('drain-agent-pr.mjs')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
