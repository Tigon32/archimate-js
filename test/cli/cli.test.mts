import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'dist/cli/main.mjs');
const validFixture = path.join(root, 'test/fixtures/synthetic/minimal-application-view.xml');
const invalidFixture = path.join(root, 'test/fixtures/synthetic/invalid-reference.xml');
const batchFixture = path.join(root, 'test/fixtures/synthetic/batch-collisions.xml');

type RunResult = { output: string; json: Record<string, unknown> };

function runCli(executable: string, args: string[], expectedStatus: number, env = process.env): RunResult {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: root, encoding: 'utf8', env: { ...env }
  });
  assert.equal(result.status, expectedStatus, result.stderr);
  assert.equal(result.stderr, '');
  return { output: result.stdout, json: JSON.parse(result.stdout) };
}

function codes(result: RunResult): string[] {
  return (result.json.diagnostics as Array<{ code: string }>).map(({ code }) => code);
}

async function validationTests(): Promise<void> {
  const valid = runCli(cli, ['validate', validFixture], 0);
  assert.equal(valid.json.command, 'validate');
  assert.equal(valid.json.valid, true);
  assert.equal(valid.output.includes('model-synthetic-minimal'), false);
  const invalid = runCli(cli, ['validate', invalidFixture], 1);
  assert.ok(codes(invalid).includes('STRUCTURE_REFERENCE_UNRESOLVED'));
  assert.equal(invalid.output.includes('missing-element'), false);
  const usage = runCli(cli, ['export', validFixture, '--view-id', 'view'], 2);
  assert.deepEqual(codes(usage), ['CLI_USAGE']);

  await mkdir(path.join(root, 'test-results'), { recursive: true });
  const directory = await mkdtemp(path.join(root, 'test-results/archimate-cli-validation-'));
  try {
    const output = path.join(directory, 'output');
    const invalidExport = runCli(cli, [
      'export', invalidFixture, '--view-id', 'view', '--format', 'svg', '--output-dir', output
    ], 1);
    assert.equal(invalidExport.json.valid, false);
    await assert.rejects(readdir(output));

    const unbuilt = path.join(directory, 'unbuilt');
    await mkdir(path.join(unbuilt, 'dist'), { recursive: true });
    await cp(path.join(root, 'dist/cli'), path.join(unbuilt, 'dist/cli'), { recursive: true });
    await cp(path.join(root, 'dist/validator'), path.join(unbuilt, 'dist/validator'), { recursive: true });
    const missingBuild = runCli(path.join(unbuilt, 'dist/cli/main.mjs'), [
      'export', validFixture, '--view-id', 'view-synthetic-minimal',
      '--format', 'svg', '--output-dir', output
    ], 1);
    assert.deepEqual(codes(missingBuild), ['RENDER_BUILD_MISSING']);
    assert.equal(missingBuild.output.includes(unbuilt), false);

    const missingBrowser = runCli(cli, [
      'export', validFixture, '--view-id', 'view-synthetic-minimal', '--format', 'svg',
      '--output-dir', output, '--chrome', path.join(directory, 'missing-chrome')
    ], 1, { ...process.env, CHROME_BIN: '' });
    assert.deepEqual(codes(missingBrowser), ['BROWSER_NOT_FOUND']);

    const invalidBatch = runCli(cli, [
      'export', invalidFixture, '--all-views', '--format', 'svg,png', '--output-dir', output
    ], 1);
    assert.equal(invalidBatch.json.valid, false);
    await assert.rejects(readdir(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function browserTests(): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-cli-browser-'));
  try {
    const legacyPath = path.join(directory, 'legacy.svg');
    const render = runCli(cli, [
      'render', validFixture, '--view-id', 'view-synthetic-minimal', '--output', legacyPath
    ], 0);
    assert.equal(render.json.command, 'render');
    assert.equal(render.json.valid, true);
    assert.match(await readFile(legacyPath, 'utf8'), /^<svg[^>]+role="img"/);

    const exported = runCli(cli, [
      'export', validFixture, '--view-name', 'Synthetic Minimal View',
      '--format', 'svg,png,pdf', '--output-dir', directory, '--basename', 'Quarter / View',
      '--scale', '2', '--background', '#ffffff', '--pdf-page-size', 'A4',
      '--pdf-orientation', 'landscape'
    ], 0);
    assert.deepEqual(exported.json.formats, ['svg', 'png', 'pdf']);
    const svg = await readFile(path.join(directory, 'Quarter-View.svg'), 'utf8');
    const png = await readFile(path.join(directory, 'Quarter-View.png'));
    const pdf = await readFile(path.join(directory, 'Quarter-View.pdf'));
    assert.match(svg, /^<svg[^>]+role="img"/);
    assert.ok(svg.includes('<rect width="100%" height="100%" fill="#ffffff"/>'));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');

    const missingPath = path.join(directory, 'missing');
    const missing = runCli(cli, [
      'export', validFixture, '--view-id', 'private-view-id', '--format', 'svg,png',
      '--output-dir', missingPath
    ], 1);
    assert.deepEqual(codes(missing), ['VIEW_NOT_FOUND']);
    assert.equal(missing.output.includes('private-view-id'), false);
    await assert.rejects(readdir(missingPath));

    await batchBrowserTests(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function batchBrowserTests(directory: string): Promise<void> {
  const batchDir = path.join(directory, 'batch');
  const batchArgs = [
    'export', batchFixture, '--all-views', '--format', 'svg,png,pdf', '--output-dir', batchDir
  ];
  const batch = runCli(cli, batchArgs, 0);
  assert.equal(batch.json.valid, true);
  const first = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'));
  assert.equal(first.schemaVersion, 1);
  assert.deepEqual(first.entries.map((item: { viewId: string }) => item.viewId),
    ['view-a', 'view-b', 'view-z']);
  assert.equal(new Set(first.entries.flatMap((item: { outputs: Array<{ path: string }> }) =>
    item.outputs.map((output) => output.path))).size, 9);
  for (const entry of first.entries) {
    assert.deepEqual(entry.outputs.map((item: { format: string }) => item.format), ['svg', 'png', 'pdf']);
    for (const output of entry.outputs) {
      assert.equal(path.basename(output.path), output.path);
      assert.ok(output.dimensions.width > 0 && output.dimensions.height > 0);
      assert.equal(createHash('sha256').update(await readFile(path.join(batchDir, output.path)))
        .digest('hex'), output.sha256);
    }
  }
  const svgHashes = first.entries.map((item: { outputs: Array<{ format: string; sha256: string }> }) =>
    item.outputs.find((output) => output.format === 'svg')?.sha256);
  runCli(cli, batchArgs, 0);
  const second = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(second.entries.map((item: { outputs: Array<{ format: string; sha256: string }> }) =>
    item.outputs.find((output) => output.format === 'svg')?.sha256), svgHashes);
}

const mode = process.argv[2];
if (mode === 'validate') await validationTests();
else if (mode === 'browser') await browserTests();
else throw new Error('CLI test mode must be validate or browser.');
console.log(`CLI ${mode} tests passed`);
