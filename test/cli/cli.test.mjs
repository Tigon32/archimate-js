import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { writeAtomic } from '../../bin/cli-io.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'bin/archimate-js.mjs');
const validFixture = path.join(root, 'test/fixtures/synthetic/minimal-application-view.xml');
const invalidFixture = path.join(root, 'test/fixtures/synthetic/invalid-reference.xml');

function run(args, expectedStatus) {
  return runCli(cli, args, expectedStatus);
}

function runCli(executable, args, expectedStatus) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env }
  });
  assert.equal(result.status, expectedStatus, result.stderr);
  assert.equal(result.stderr, '');
  return { output: result.stdout, json: JSON.parse(result.stdout) };
}

async function testValidate() {
  const valid = run(['validate', validFixture], 0);
  assert.equal(valid.json.command, 'validate');
  assert.equal(valid.json.valid, true);
  assert.deepEqual(valid.json.diagnostics.map(({ code }) => code), [
    'SEMANTICS_RELATIONSHIP_COMBINATION_UNSUPPORTED'
  ]);
  assert.deepEqual(valid.json.suggestions, []);
  assert.equal(valid.output.includes('model-synthetic-minimal'), false);
  assert.equal(valid.output.includes('<model'), false);

  const invalid = run(['validate', invalidFixture], 1);
  assert.equal(invalid.json.command, 'validate');
  assert.equal(invalid.json.valid, false);
  assert.ok(invalid.json.diagnostics.some(({ code }) => code === 'STRUCTURE_REFERENCE_UNRESOLVED'));
  assert.equal(invalid.output.includes('missing-element'), false);
  assert.equal(invalid.output.includes('<model'), false);

  const usage = run(['render', validFixture, '--view-id', 'view-synthetic-minimal'], 2);
  assert.deepEqual(usage.json.diagnostics.map(({ code }) => code), ['CLI_USAGE']);

  const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-cli-output-mode-'));
  try {
    const directoryInput = run(['validate', temp], 1);
    assert.deepEqual(directoryInput.json.diagnostics.map(({ code }) => code), ['INPUT_READ_FAILED']);
    assert.equal(directoryInput.output.includes(temp), false);

    const oversizedInput = path.join(temp, 'oversized.xml');
    await writeFile(oversizedInput, 'x'.repeat(1_048_577));
    const oversized = run(['validate', oversizedInput], 1);
    assert.deepEqual(oversized.json.diagnostics.map(({ code }) => code), ['INPUT_SIZE_LIMIT']);
    assert.equal(oversized.output.includes(oversizedInput), false);

    const newOutput = path.join(temp, 'new.svg');
    await writeAtomic(newOutput, '<svg />');
    assert.equal((await stat(newOutput)).mode % 0o1000, 0o600);

    const existingOutput = path.join(temp, 'existing.svg');
    await writeFile(existingOutput, 'old', { mode: 0o640 });
    await chmod(existingOutput, 0o640);
    await writeAtomic(existingOutput, '<svg>replacement</svg>');
    assert.equal((await stat(existingOutput)).mode % 0o1000, 0o640);
    assert.equal(await readFile(existingOutput, 'utf8'), '<svg>replacement</svg>');

    const privateOutput = path.join(temp, 'private.svg');
    await writeFile(privateOutput, 'old', { mode: 0o600 });
    await chmod(privateOutput, 0o600);
    await writeAtomic(privateOutput, '<svg>private</svg>');
    assert.equal((await stat(privateOutput)).mode % 0o1000, 0o600);

    const directoryOutput = path.join(temp, 'directory.svg');
    await mkdir(directoryOutput);
    await assert.rejects(writeAtomic(directoryOutput, '<svg />'), { message: 'OUTPUT_WRITE_FAILED' });
    assert.equal((await readdir(temp)).some((name) => name.includes(`.${process.pid}.tmp`)), false);

    const unbuiltRoot = path.join(temp, 'unbuilt-package');
    await mkdir(path.join(unbuiltRoot, 'bin'), { recursive: true });
    await copyFile(cli, path.join(unbuiltRoot, 'bin/archimate-js.mjs'));
    await copyFile(path.join(root, 'bin/cli-io.mjs'), path.join(unbuiltRoot, 'bin/cli-io.mjs'));
    const unbuilt = runCli(
      path.join(unbuiltRoot, 'bin/archimate-js.mjs'),
      ['validate', validFixture],
      1
    );
    assert.deepEqual(unbuilt.json.diagnostics.map(({ code }) => code), ['CLI_INTERNAL_ERROR']);
    assert.equal(unbuilt.output.includes(unbuiltRoot), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function testRender() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'archimate-cli-synthetic-'));
  try {
    const firstPath = path.join(temp, 'first.svg');
    const secondPath = path.join(temp, 'second.svg');
    const args = ['render', validFixture, '--view-id', 'view-synthetic-minimal'];
    const first = run([...args, '--output', firstPath], 0);
    const second = run([...args, '--output', secondPath], 0);
    assert.equal(first.json.valid, true);
    assert.deepEqual(first.json, second.json);

    const firstSvg = await readFile(firstPath, 'utf8');
    const secondSvg = await readFile(secondPath, 'utf8');
    assert.equal(firstSvg, secondSvg);
    assert.match(firstSvg, /^<svg[^>]+role="img"/);
    assert.ok(firstSvg.includes('Component label'));

    const missingPath = path.join(temp, 'missing.svg');
    const missing = run([
      'render', validFixture, '--view-id', 'synthetic-missing-view', '--output', missingPath
    ], 1);
    assert.deepEqual(missing.json.diagnostics.map(({ code }) => code), ['VIEW_NOT_FOUND']);
    assert.equal(missing.output.includes('model-synthetic-minimal'), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

const mode = process.argv[2];
if (mode === 'validate') await testValidate();
else if (mode === 'render') await testRender();
else throw new Error('CLI test mode must be validate or render.');

console.log(`CLI ${mode} tests passed`);
