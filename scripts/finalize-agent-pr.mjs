import { execFileSync, spawnSync } from 'node:child_process';

function capture(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function isAgentBranch(branch) {
  return typeof branch === 'string' && branch.startsWith('agent/');
}

function main() {
  const root = capture('git', ['rev-parse', '--show-toplevel']);
  process.chdir(root);

  const branch = capture('git', ['branch', '--show-current']);
  if (!isAgentBranch(branch)) {
    throw new Error(`Refusing to finalize non-agent branch: ${branch || '(detached HEAD)'}`);
  }

  const status = capture('git', ['status', '--porcelain']);
  if (status) {
    throw new Error('Refusing to finalize with uncommitted changes; commit the WIP checkpoint first.');
  }

  run('npm', ['run', 'verify:local']);
  run('git', ['push', '--set-upstream', 'origin', 'HEAD']);

  const headSha = capture('git', ['rev-parse', 'HEAD']);
  const pr = JSON.parse(capture('gh', [
    'pr', 'view',
    '--json', 'number,isDraft,headRefOid,headRefName,baseRefName,url'
  ]));

  if (pr.headRefName !== branch || pr.headRefOid !== headSha) {
    throw new Error(`PR head does not match local HEAD: local=${headSha} remote=${pr.headRefOid}`);
  }
  if (pr.baseRefName !== 'main') {
    throw new Error(`Refusing automatic promotion to non-main base: ${pr.baseRefName}`);
  }

  if (pr.isDraft) {
    run('gh', ['pr', 'ready', String(pr.number)]);
  }

  console.log(`PR #${pr.number} is Ready at exact HEAD ${headSha}; repository drain automation owns merge completion.`);
}

if (process.argv[1]) main();
