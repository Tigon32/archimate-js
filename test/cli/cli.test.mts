import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cli = path.join(root, 'dist/cli/main.mjs');
const validFixture = path.join(root, 'test/fixtures/synthetic/minimal-application-view.xml');
const invalidFixture = path.join(root, 'test/fixtures/synthetic/invalid-reference.xml');
const batchFixture = path.join(root, 'test/fixtures/synthetic/batch-collisions.xml');
const dtoFixture = path.join(root, 'test/fixtures/synthetic/dto-export-view.xml');
const cleanLintFixture = path.join(root, 'test/fixtures/synthetic/lint-cli-clean.xml');
const unsupportedDtoFixture = path.join(root, 'test/fixtures/meff-schema/valid-view-presentation.xml');

type RunResult = { output: string; json: Record<string, unknown> };

function runCli(executable: string, args: string[], expectedStatus: number, env = process.env): RunResult {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: root, encoding: 'utf8', env: { ...env }
  });
  assert.equal(result.status, expectedStatus, result.stderr);
  assert.equal(result.stderr, '');
  return { output: result.stdout, json: JSON.parse(result.stdout) };
}

function runCliText(executable: string, args: string[], expectedStatus: number): string {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env }
  });
  assert.equal(result.status, expectedStatus, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout;
}

function codes(result: RunResult): string[] {
  return (result.json.diagnostics as Array<{ code: string }>).map(({ code }) => code);
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
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
  await diffTests();
  await lintTests();

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
    await cp(path.join(root, 'dist/language'), path.join(unbuilt, 'dist/language'), { recursive: true });
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

async function lintTests(): Promise<void> {
  const clean = runCli(cli, ['lint', cleanLintFixture, '--format', 'json'], 0);
  assert.equal(clean.json.command, 'lint');
  assert.equal(clean.json.result, 'clean');
  assert.deepEqual(clean.json.findings, []);
  assert.deepEqual(clean.json.summary, { errors: 0, warnings: 0, info: 0, total: 0 });
  assert.deepEqual(runCli(cli, ['lint', cleanLintFixture, '--format', 'json'], 0).json, clean.json);
  assert.match(runCliText(cli, ['lint', cleanLintFixture], 0), /Lint: clean/);

  const warning = runCli(cli, ['lint', path.join(root,
    'test/fixtures/meff-schema/valid-model.xml'), '--format', 'json'], 0);
  assert.ok((warning.json.summary as { warnings: number }).warnings > 0);
  assert.equal((warning.json.summary as { errors: number }).errors, 0);
  assert.match(runCliText(cli, ['lint', path.join(root,
    'test/fixtures/meff-schema/valid-model.xml')], 0), /\[warning\]/);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-cli-lint-'));
  try {
    const infoInput = path.join(directory, 'info.xml');
    const cleanXml = await readFile(cleanLintFixture, 'utf8');
    await writeFile(infoInput, cleanXml.replace(
      '      <name xml:lang="en">Synthetic Function</name>\n', ''));
    const info = runCli(cli, ['lint', infoInput, '--format', 'json'], 0);
    assert.ok((info.json.summary as { info: number }).info > 0);
    assert.equal((info.json.summary as { errors: number }).errors, 0);

    const malformed = path.join(directory, 'malformed.xml');
    await writeFile(malformed, '<model><name>SYNTHETIC malformed input</name>');
    const invalid = runCli(cli, ['lint', malformed, '--format', 'json'], 2);
    assert.deepEqual(codes(invalid), ['LINT_INPUT_INVALID']);
    assert.equal(invalid.output.includes('SYNTHETIC malformed input'), false);
    assert.equal(invalid.output.includes(directory), false);
    const humanInvalid = runCliText(cli, ['lint', malformed], 2);
    assert.match(humanInvalid, /^Lint failed:/);
    assert.equal(humanInvalid.includes(directory), false);

    const usage = runCli(cli, ['lint', cleanLintFixture, '--format', 'yaml'], 2);
    assert.deepEqual(codes(usage), ['CLI_USAGE']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function diffTests(): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-cli-diff-'));
  try {
    const before = path.join(directory, 'before.xml');
    const after = path.join(directory, 'after.xml');
    const source = await readFile(dtoFixture, 'utf8');
    await writeFile(before, source);
    await writeFile(after, source);
    const unchanged = runCli(cli, ['diff', before, after, '--format', 'json'], 0);
    assert.equal(unchanged.json.command, 'diff');
    assert.equal(unchanged.json.result, 'unchanged');
    assert.deepEqual(unchanged.json.changes, []);
    assert.deepEqual(unchanged.json.impactedViewIds, []);
    assert.deepEqual(runCli(cli, ['diff', before, after, '--format', 'json'], 0).json,
      unchanged.json);

    await writeFile(after, source.replace('<name>Component One</name>', '<name>Component Updated</name>'));
    const changed = runCli(cli, ['diff', before, after, '--format', 'json'], 1);
    assert.equal(changed.json.result, 'changed');
    assert.ok(changed.output.includes('Component One'));
    assert.deepEqual(changed.json.impactedViewIds, ['view-dto-export']);
    const human = runCliText(cli, ['diff', before, after], 1);
    assert.match(human, /Semantic changes:/);
    assert.match(human, /Presentation changes:/);
    assert.match(human, /Impacted views \(\d+\):/);
    assert.ok(human.includes('view-dto-export'));

    const invalid = path.join(directory, 'invalid.xml');
    await writeFile(invalid, '<model><name>private model text</name>');
    const invalidResult = runCli(cli, ['diff', before, invalid], 2);
    assert.deepEqual(codes(invalidResult), ['DIFF_INPUT_INVALID']);
    assert.equal(invalidResult.output.includes('private model text'), false);
    assert.equal(invalidResult.output.includes(directory), false);
    const ineligible = path.join(directory, 'ineligible.xml');
    await writeFile(ineligible, await readFile(unsupportedDtoFixture, 'utf8'));
    const ineligibleResult = runCli(cli, ['diff', before, ineligible], 2);
    assert.deepEqual(codes(ineligibleResult), ['DIFF_INPUT_INELIGIBLE']);
    assert.equal(ineligibleResult.output.includes('model-synthetic-presentation'), false);
    const missing = runCli(cli, ['diff', before, path.join(directory, 'missing.xml')], 2);
    assert.deepEqual(codes(missing), ['DIFF_INPUT_INVALID']);
    const samePath = runCli(cli, ['diff', before, before], 2);
    assert.deepEqual(codes(samePath), ['CLI_USAGE']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function browserTests(): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-cli-browser-'));
  try {
    await runBrowserScenarios(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runBrowserScenarios(directory: string): Promise<void> {
  await legacyRenderTest(directory);
  await defaultExportTest(directory);
  await reportExportTest(directory);
  await transparentExportTest(directory);
  await invalidLayoutTest(directory);
  await missingViewTest(directory);
  await batchBrowserTests(directory);
  await partialBrowserTest(directory);
}

async function legacyRenderTest(directory: string): Promise<void> {
    const legacyPath = path.join(directory, 'legacy.svg');
    const render = runCli(cli, [
      'render', validFixture, '--view-id', 'view-synthetic-minimal', '--output', legacyPath
    ], 0);
    assert.equal(render.json.command, 'render');
    assert.equal(render.json.valid, true);
    assert.match(await readFile(legacyPath, 'utf8'), /^<svg[^>]+role="graphics-document document"/);
}

async function defaultExportTest(directory: string): Promise<void> {
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
    assert.match(svg, /^<svg[^>]+role="graphics-document document"/);
    assert.ok(svg.includes('<rect width="100%" height="100%" fill="#ffffff"/>'));
    assert.deepEqual(pngDimensions(png), { width: 1000, height: 320 });
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
}

async function reportExportTest(directory: string): Promise<void> {
    const report = runCli(cli, [
      'export', validFixture, '--view-id', 'view-synthetic-minimal',
      '--format', 'svg,png,pdf', '--output-dir', directory, '--basename', 'report',
      '--scale', '2', '--background', 'white', '--fit', 'contain', '--padding', '12',
      '--pdf-title', 'Synthetic report', '--pdf-footer', 'Page 1'
    ], 0);
    assert.deepEqual(report.json.formats, ['svg', 'png', 'pdf']);
    const reportSvg = await readFile(path.join(directory, 'report.svg'), 'utf8');
    const reportPng = await readFile(path.join(directory, 'report.png'));
    const reportPdf = await readFile(path.join(directory, 'report.pdf'));
    assert.match(reportSvg, /viewBox="8 8 524 184"/);
    assert.match(reportSvg, /preserveAspectRatio="xMidYMid meet"/);
    assert.deepEqual(pngDimensions(reportPng), { width: 1048, height: 368 });
    assert.equal(reportPdf.subarray(0, 5).toString('ascii'), '%PDF-');
}

async function transparentExportTest(directory: string): Promise<void> {
    const transparent = runCli(cli, [
      'export', validFixture, '--view-id', 'view-synthetic-minimal',
      '--format', 'png', '--output-dir', directory, '--basename', 'transparent',
      '--background', 'transparent'
    ], 0);
    assert.deepEqual(transparent.json.formats, ['png']);
    assert.deepEqual(pngDimensions(await readFile(path.join(directory, 'transparent.png'))),
      { width: 500, height: 160 });
}

async function invalidLayoutTest(directory: string): Promise<void> {
    const invalidLayout = runCli(cli, [
      'export', validFixture, '--view-id', 'view-synthetic-minimal',
      '--format', 'png', '--output-dir', directory, '--basename', 'invalid',
      '--padding', '1025'
    ], 2);
    assert.deepEqual(codes(invalidLayout), ['CLI_USAGE']);
    await assert.rejects(stat(path.join(directory, 'invalid.png')));
}

async function missingViewTest(directory: string): Promise<void> {
    const missingPath = path.join(directory, 'missing');
    const missing = runCli(cli, [
      'export', validFixture, '--view-id', 'private-view-id', '--format', 'svg,png',
      '--output-dir', missingPath
    ], 1);
    assert.deepEqual(codes(missing), ['VIEW_NOT_FOUND']);
    assert.equal(missing.output.includes('private-view-id'), false);
    await assert.rejects(readdir(missingPath));
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
  const continued = runCli(cli, [...batchArgs, '--continue-on-error'], 0);
  assert.equal(continued.json.valid, true);
  const complete = JSON.parse(await readFile(path.join(batchDir, 'manifest.json'), 'utf8'));
  assert.equal(complete.overallStatus, 'success');
  assert.ok(complete.entries.every((entry: { status: string }) => entry.status === 'success'));
  await formatOrderTests(directory);
}

async function formatOrderTests(directory: string): Promise<void> {
  for (const formats of ['png', 'pdf']) {
    const output = path.join(directory, `batch-${formats}`);
    const result = runCli(cli, ['export', batchFixture, '--all-views', '--format', formats, '--output-dir', output], 0);
    assert.deepEqual(result.json.formats, [formats]);
    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    assert.ok(manifest.entries.every((entry: { outputs: Array<{ format: string }> }) =>
      entry.outputs.length === 1 && entry.outputs[0].format === formats));
    assert.equal((await readdir(output)).filter((name) => name.endsWith('.svg')).length, 0);
  }
  const pngFirst = path.join(directory, 'order-png-first');
  const pdfFirst = path.join(directory, 'order-pdf-first');
  runCli(cli, ['export', batchFixture, '--all-views', '--format', 'png,pdf', '--output-dir', pngFirst], 0);
  runCli(cli, ['export', batchFixture, '--all-views', '--format', 'pdf,png', '--output-dir', pdfFirst], 0);
  const pngA = await readFile(path.join(pngFirst, 'Resume-Q4.png'));
  const pngB = await readFile(path.join(pdfFirst, 'Resume-Q4.png'));
  assert.deepEqual(pngDimensions(pngA), pngDimensions(pngB));
  assert.equal(createHash('sha256').update(pngA).digest('hex'), createHash('sha256').update(pngB).digest('hex'));
  const shape = (value: any) => ({ schemaVersion: value.schemaVersion,
    entries: value.entries.map((entry: any) => ({ ...entry,
      outputs: entry.outputs.map(({ format, path: outputPath, dimensions }: any) =>
        ({ format, path: outputPath, dimensions })) })) });
  assert.deepEqual(shape(JSON.parse(await readFile(path.join(pngFirst, 'manifest.json'), 'utf8'))),
    shape(JSON.parse(await readFile(path.join(pdfFirst, 'manifest.json'), 'utf8'))));
}

async function partialBrowserTest(directory: string): Promise<void> {
  const xml = await readFile(batchFixture, 'utf8');
  const privateId = 'view-b';
  const modified = xml.replace('id="node-b" elementRef="application-service-1" x="25" y="25" w="160"',
    'id="node-b" elementRef="application-service-1" x="25" y="25" w="100000"');
  assert.notEqual(modified, xml);
  const input = path.join(directory, 'partial-synthetic.xml');
  await writeFile(input, modified);
  const output = path.join(directory, 'partial');
  const args = ['export', input, '--all-views', '--format', 'svg', '--output-dir', output];
  const failFast = runCli(cli, args, 1);
  assert.deepEqual(codes(failFast), ['EXPORT_DIMENSIONS_EXCEEDED']);
  await assert.rejects(readdir(output));
  const result = runCli(cli, [...args, '--continue-on-error'], 1);
  assert.deepEqual(codes(result), ['BATCH_PARTIAL_FAILURE']);
  assert.equal(result.output.includes(privateId), false);
  assert.equal(result.output.includes(directory), false);
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.policy, 'continue-on-error');
  assert.equal(manifest.overallStatus, 'partial_failure');
  assert.deepEqual(manifest.entries.map((entry: { status: string }) => entry.status),
    ['success', 'failed', 'success']);
  assert.deepEqual(manifest.entries[1].diagnostics, [{ code: 'EXPORT_DIMENSIONS_EXCEEDED' }]);
  assert.deepEqual(manifest.entries[1].outputs, []);
  for (const entry of [manifest.entries[0], manifest.entries[2]]) {
    assert.equal(createHash('sha256').update(await readFile(path.join(output, entry.outputs[0].path)))
      .digest('hex'), entry.outputs[0].sha256);
  }
}

async function assertLegacyRender(directory: string): Promise<void> {
  const legacyPath = path.join(directory, 'legacy.svg');
  const render = runCli(cli, [
    'render', validFixture, '--view-id', 'view-synthetic-minimal', '--output', legacyPath
  ], 0);
  assert.equal(render.json.command, 'render');
  assert.equal(render.json.valid, true);
  assert.match(await readFile(legacyPath, 'utf8'), /^<svg[^>]+role="graphics-document document"/);
}

async function assertDefaultExport(directory: string): Promise<void> {
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
  assert.match(svg, /^<svg[^>]+role="graphics-document document"/);
  assert.ok(svg.includes('<rect width="100%" height="100%" fill="#ffffff"/>'));
  assert.deepEqual(pngDimensions(png), { width: 1020, height: 340 });
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
}

async function assertReportExport(directory: string): Promise<void> {
  const report = runCli(cli, [
    'export', validFixture, '--view-id', 'view-synthetic-minimal',
    '--format', 'svg,png,pdf', '--output-dir', directory, '--basename', 'report',
    '--scale', '2', '--background', 'white', '--fit', 'contain', '--padding', '12',
    '--pdf-title', 'Synthetic report', '--pdf-footer', 'Page 1'
  ], 0);
  assert.deepEqual(report.json.formats, ['svg', 'png', 'pdf']);
  const reportSvg = await readFile(path.join(directory, 'report.svg'), 'utf8');
  const reportPng = await readFile(path.join(directory, 'report.png'));
  const reportPdf = await readFile(path.join(directory, 'report.pdf'));
  assert.match(reportSvg, /viewBox="3 3 534 194"/);
  assert.match(reportSvg, /preserveAspectRatio="xMidYMid meet"/);
  assert.deepEqual(pngDimensions(reportPng), { width: 1068, height: 388 });
  assert.equal(reportPdf.subarray(0, 5).toString('ascii'), '%PDF-');
}

async function assertTransparentExport(directory: string): Promise<void> {
  const transparent = runCli(cli, [
    'export', validFixture, '--view-id', 'view-synthetic-minimal',
    '--format', 'png', '--output-dir', directory, '--basename', 'transparent',
    '--background', 'transparent'
  ], 0);
  assert.deepEqual(transparent.json.formats, ['png']);
  assert.deepEqual(pngDimensions(await readFile(path.join(directory, 'transparent.png'))),
    { width: 510, height: 170 });
}

async function assertInvalidLayout(directory: string): Promise<void> {
  const invalidLayout = runCli(cli, [
    'export', validFixture, '--view-id', 'view-synthetic-minimal',
    '--format', 'png', '--output-dir', directory, '--basename', 'invalid',
    '--padding', '1025'
  ], 2);
  assert.deepEqual(codes(invalidLayout), ['CLI_USAGE']);
  await assert.rejects(stat(path.join(directory, 'invalid.png')));
}

async function assertMissingView(directory: string): Promise<void> {
  const missingPath = path.join(directory, 'missing');
  const missing = runCli(cli, [
    'export', validFixture, '--view-id', 'private-view-id', '--format', 'svg,png',
    '--output-dir', missingPath
  ], 1);
  assert.deepEqual(codes(missing), ['VIEW_NOT_FOUND']);
  assert.equal(missing.output.includes('private-view-id'), false);
  await assert.rejects(readdir(missingPath));
}

const mode = process.argv[2];
if (mode === 'validate') await validationTests();
else if (mode === 'browser') await browserTests();
else throw new Error('CLI test mode must be validate or browser.');
console.log(`CLI ${mode} tests passed`);
