import { execFileSync } from 'node:child_process';
import path from 'node:path';

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function main() {
  let repositoryRoot;

  try {
    repositoryRoot = git(['rev-parse', '--show-toplevel']).trim();
  } catch {
    console.log('archimate-js: not a Git checkout; skipping hook installation.');
    return;
  }

  if (path.resolve(repositoryRoot) !== path.resolve(process.cwd())) {
    console.log('archimate-js: package is not the repository root; skipping hook installation.');
    return;
  }

  let configuredPath = '';
  try {
    configuredPath = git(['config', '--local', '--get', 'core.hooksPath'], {
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    // Fresh checkouts normally have no core.hooksPath yet.
  }

  if (configuredPath === '.githooks') {
    console.log('archimate-js: repository Git hooks already configured.');
    return;
  }

  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
    cwd: repositoryRoot,
    stdio: 'inherit'
  });
  console.log('archimate-js: configured core.hooksPath=.githooks');
}

main();
