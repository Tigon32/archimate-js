/// <reference types="node" />
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAgentBranch } from '../src/coordination/agent-branch.mts';
import { githubRepositorySlug } from '../src/coordination/github-repository.mts';

function capture(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function requireExpectedHead(expected: string, stage: string): void {
  const current = capture('git', ['rev-parse', 'HEAD']);
  if (current !== expected) throw new Error(`HEAD changed ${stage}: expected=${expected} actual=${current}`);
  const status = capture('git', ['status', '--porcelain']);
  if (status) throw new Error(`Working tree changed ${stage}; refusing to push or promote.`);
}

function main(): void {
  const root = capture('git', ['rev-parse', '--show-toplevel']);
  process.chdir(root);
  const branch = capture('git', ['branch', '--show-current']);
  if (!isAgentBranch(branch)) throw new Error(`Refusing to finalize non-agent branch: ${branch || '(detached HEAD)'}`);
  const repository = githubRepositorySlug(capture('git', ['remote', 'get-url', 'origin']));
  const expectedHead = capture('git', ['rev-parse', 'HEAD']);
  requireExpectedHead(expectedHead, 'before local verification');
  run('npm', ['run', 'verify:local']);
  requireExpectedHead(expectedHead, 'during local verification');
  run('git', ['push', '--set-upstream', 'origin', 'HEAD']);
  requireExpectedHead(expectedHead, 'after push');

  const pr = JSON.parse(capture('gh', [
    'pr', 'view', '--repo', repository, '--json', 'number,isDraft,headRefOid,headRefName,baseRefName,url'
  ])) as { number: number; isDraft: boolean; headRefOid: string; headRefName: string; baseRefName: string; url: string };
  if (pr.headRefName !== branch || pr.headRefOid !== expectedHead) {
    throw new Error(`PR head does not match verified HEAD: verified=${expectedHead} remote=${pr.headRefOid}`);
  }
  if (pr.baseRefName !== 'main') throw new Error(`Refusing automatic promotion to non-main base: ${pr.baseRefName}`);
  requireExpectedHead(expectedHead, 'before Ready promotion');
  if (pr.isDraft) run('gh', ['pr', 'ready', String(pr.number), '--repo', repository]);
  console.log(`PR #${pr.number} is Ready at exact verified HEAD ${expectedHead}; repository drain automation owns merge completion.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
