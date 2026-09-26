// SYNTHETIC provenance: inline filenames exercise ADR collision logic only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findAdrCollisions, type AdrGitFile, type OpenPrAdrFile } from '../../scripts/check-adr-collisions.mts';

function gitFile(path: string, blob = `${path}:blob`): AdrGitFile {
  return { path, blob };
}

function prFile(path: string, changeType = 'ADDED'): OpenPrAdrFile {
  return { path, changeType };
}

test('reports a collision with a different ADR file on main', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0003-new-topic.md')],
    mainFiles: [gitFile('docs/adr/0001-one.md'), gitFile('docs/adr/0003-existing-topic.md')],
    openPrs: []
  }), [{ number: '0003', source: 'main', nextFree: '0004' }]);
});

test('reports a collision with another open PR', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0004-current.md')],
    mainFiles: [gitFile('docs/adr/0001-one.md'), gitFile('docs/adr/0002-two.md')],
    openPrs: [{ number: 17, headRefName: 'synthetic-topic', files: [prFile('docs/adr/0004-other.md')] }]
  }), [{ number: '0004', source: 'PR #17', nextFree: '0005' }]);
});

test('ignores ADR files from the current pull request', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0004-current.md')],
    mainFiles: [gitFile('docs/adr/0001-one.md'), gitFile('docs/adr/0002-two.md')],
    openPrs: [{ number: 18, headRefName: 'self', files: [prFile('docs/adr/0004-current.md')] }],
    selfPr: 18
  }), []);
});

test('allows ADR numbers that are absent from main and other open PRs', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0003-current.md')],
    mainFiles: [gitFile('docs/adr/0001-one.md'), gitFile('docs/adr/0002-two.md')],
    openPrs: [{ number: 19, headRefName: 'other', files: [prFile('docs/adr/0004-other.md')] }]
  }), []);
});

test('computes nextFree from main plus every open PR', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0002-current.md')],
    mainFiles: [gitFile('docs/adr/0001-one.md'), gitFile('docs/adr/0002-main.md')],
    openPrs: [
      { number: 20, headRefName: 'high', files: [prFile('docs/adr/0010-high.md')] },
      { number: 21, headRefName: 'middle', files: [prFile('docs/adr/0007-middle.md')] }
    ]
  }), [{ number: '0002', source: 'main', nextFree: '0011' }]);
});

test('ignores another pull request that only modifies an existing ADR', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0014-current.md')],
    mainFiles: [gitFile('docs/adr/0001-one.md'), gitFile('docs/adr/0013-thirteen.md')],
    openPrs: [{ number: 22, headRefName: 'edit-adr', files: [prFile('docs/adr/0005-existing.md', 'MODIFIED')] }]
  }), []);
});

test('reports another pull request that adds the same ADR number', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0014-current.md')],
    mainFiles: [gitFile('docs/adr/0001-one.md'), gitFile('docs/adr/0013-thirteen.md')],
    openPrs: [{ number: 23, headRefName: 'new-adr', files: [prFile('docs/adr/0014-other.md')] }]
  }), [{ number: '0014', source: 'PR #23', nextFree: '0015' }]);
});

test('does not report the same path and blob on main as a collision', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0014-same-name.md', 'same-blob')],
    mainFiles: [gitFile('docs/adr/0014-same-name.md', 'same-blob')],
    openPrs: []
  }), []);
});

test('reports the same path with a different blob on main as a collision', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0014-same-name.md', 'head-blob')],
    mainFiles: [gitFile('docs/adr/0014-same-name.md', 'main-blob')],
    openPrs: []
  }), [{ number: '0014', source: 'main', nextFree: '0015' }]);
});

test('reports a different path with the same ADR number on main as a collision', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0014-current.md')],
    mainFiles: [gitFile('docs/adr/0014-other.md')],
    openPrs: []
  }), [{ number: '0014', source: 'main', nextFree: '0015' }]);
});

test('computes nextFree without numbers that only appear in modified open PR files', () => {
  assert.deepEqual(findAdrCollisions({
    added: [gitFile('docs/adr/0002-current.md')],
    mainFiles: [gitFile('docs/adr/0001-one.md'), gitFile('docs/adr/0002-main.md'), gitFile('docs/adr/0013-thirteen.md')],
    openPrs: [{ number: 24, headRefName: 'edit-high', files: [prFile('docs/adr/0099-existing.md', 'MODIFIED')] }]
  }), [{ number: '0002', source: 'main', nextFree: '0014' }]);
});
