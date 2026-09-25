const REQUIRED_WORKFLOWS = new Set(['CI', 'Automated security analysis']);
const DEPENDABOT_SAFE_GROUPS = [
  'npm-minor-and-patch',
  'npm-security-minor-and-patch',
  'archimate-font-minor-and-patch',
  'archimate-font-security-minor-and-patch',
  'actions-minor-and-patch'
];
const GOOD_OPTIONAL_CONCLUSIONS = new Set(['success', 'skipped']);

interface WorkflowRun {
  name: string;
  id: number | string;
  status: string;
  conclusion: string | null;
}

interface PullRequest {
  state: string;
  draft: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  user?: { login?: string };
  base?: { ref?: string };
  head?: { ref?: string; sha?: string; repo?: { full_name?: string } };
  labels?: Array<{ name: string }>;
}

type AutomergeCandidate =
  | { eligible: true; kind: 'dependabot'; group: string }
  | { eligible: false; reason: string };

interface DrainDecision {
  action: 'skip' | 'wait' | 'block' | 'merge';
  reason: string;
}

export function latestRunsByName(runs: WorkflowRun[]): Map<string, WorkflowRun> {
  const latest = new Map<string, WorkflowRun>();
  for (const run of runs) {
    const current = latest.get(run.name);
    if (!current || Number(run.id) > Number(current.id)) latest.set(run.name, run);
  }
  return latest;
}

export function classifyAutomergeCandidate(pr: PullRequest, repository: string): AutomergeCandidate {
  if (pr.head?.repo?.full_name !== repository) return { eligible: false, reason: 'fork-pr' };

  if (pr.head?.ref?.startsWith('agent/')) {
    return { eligible: false, reason: 'agent-pr-requires-human-review' };
  }

  const dependabot = pr.user?.login === 'dependabot[bot]' && pr.head?.ref?.startsWith('dependabot/');
  if (dependabot) {
    const group = DEPENDABOT_SAFE_GROUPS.find((name) => pr.head?.ref?.includes(name));
    if (group) return { eligible: true, kind: 'dependabot', group };
    return { eligible: false, reason: 'dependabot-not-allowlisted' };
  }

  return { eligible: false, reason: 'unsupported-branch' };
}

export function evaluateDrainState({
  pr,
  runs,
  repository
}: {
  pr: PullRequest | null;
  runs: WorkflowRun[];
  repository: string;
}): DrainDecision {
  if (!pr || pr.state !== 'open') return { action: 'skip', reason: 'pr-not-open' };
  if (pr.draft) return { action: 'wait', reason: 'pr-is-draft' };
  if (pr.base?.ref !== 'main') return { action: 'skip', reason: 'non-main-base' };
  const candidate = classifyAutomergeCandidate(pr, repository);
  if (!candidate.eligible) return { action: 'skip', reason: candidate.reason };
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
    if (!GOOD_OPTIONAL_CONCLUSIONS.has(run.conclusion || '')) {
      return { action: 'block', reason: `failed-${run.name}:${run.conclusion}` };
    }
  }

  return { action: 'merge', reason: `all-exact-head-workflows-green:${candidate.kind}` };
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  return (response.status === 204 ? null : response.json()) as Promise<T>;
}

async function resolvePrNumber(repository: string): Promise<number> {
  const argument = Number(process.argv[2] || process.env.PR_NUMBER);
  if (Number.isInteger(argument) && argument > 0) return argument;

  const sha = process.env.HEAD_SHA;
  if (!sha) throw new Error('PR number or HEAD_SHA is required');
  const prs = await api<Array<PullRequest & { number: number }>>(
    `/repos/${repository}/commits/${sha}/pulls`
  );
  const matching = prs.filter((pr) => pr.state === 'open');
  if (matching.length !== 1) {
    throw new Error(`Expected exactly one open PR for ${sha}; found ${matching.length}`);
  }
  return matching[0].number;
}

async function main(): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');

  const prNumber = await resolvePrNumber(repository);
  const pr = await api<PullRequest>(`/repos/${repository}/pulls/${prNumber}`);
  const runsResponse = await api<{ workflow_runs?: WorkflowRun[] }>(
    `/repos/${repository}/actions/runs?head_sha=${encodeURIComponent(pr.head?.sha || '')}&event=pull_request&per_page=100`
  );
  const decision = evaluateDrainState({ pr, runs: runsResponse.workflow_runs || [], repository });
  console.log(`PR #${prNumber}: ${decision.action} (${decision.reason})`);

  if (decision.action !== 'merge') return;

  const result = await api<{ merged?: boolean; message?: string }>(
    `/repos/${repository}/pulls/${prNumber}/merge`,
    {
      method: 'PUT',
      body: JSON.stringify({ merge_method: 'squash', sha: pr.head?.sha })
    }
  );
  if (!result?.merged) throw new Error(`Merge rejected for PR #${prNumber}: ${result?.message || 'unknown reason'}`);
  console.log(`Merged PR #${prNumber} at exact HEAD ${pr.head?.sha}.`);
}

if (process.argv[1]?.endsWith('drain-agent-pr.mts')) {
  main().catch((error: unknown) => {
    console.error(error);
    throw error;
  });
}
