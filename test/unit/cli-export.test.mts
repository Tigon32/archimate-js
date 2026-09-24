import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'vitest';
import type { BrowserContext } from 'playwright-core';

import { parseArguments, sanitizeBasename } from '../../src/cli/arguments.mjs';
import { blockNetwork } from '../../src/cli/browser.mjs';
import { writeArtifacts, writeAtomic, writeBatchArtifacts } from '../../src/cli/io.mjs';
import { listBatchViews } from '../../src/cli/views.mjs';
import { prepareBatch } from '../../src/cli/batch.mjs';

describe('export arguments', () => {
  test('parses formats and options', () => {
    assert.deepEqual(parseArguments([
      'export', 'model.xml', '--view-name', 'View', '--format', 'svg,png',
      '--format', 'pdf', '--output-dir', 'out', '--basename', 'Résumé / Q4',
      '--scale', '4', '--background', '#102030', '--pdf-page-size', 'Letter',
      '--pdf-orientation', 'landscape'
    ]), {
      command: 'export', input: 'model.xml', viewName: 'View', formats: ['svg', 'png', 'pdf'],
      outputDirectory: 'out', basename: 'Resume-Q4', scale: 4, background: '#102030',
      pdfPageSize: 'Letter', pdfOrientation: 'landscape'
    });
  });

  test('rejects invalid format, selection, scale, and transparent PDF', () => {
    const common = ['export', 'model.xml', '--view-id', 'view', '--output-dir', 'out'];
    assert.throws(() => parseArguments([...common, '--format', 'gif']), { message: 'CLI_USAGE' });
    assert.throws(() => parseArguments([...common, '--format', 'png', '--scale', '5']), { message: 'CLI_USAGE' });
    assert.throws(() => parseArguments([
      ...common, '--view-name', 'View', '--format', 'svg'
    ]), { message: 'CLI_USAGE' });
    assert.throws(() => parseArguments([
      ...common, '--format', 'pdf', '--background', 'transparent'
    ]), { message: 'PDF_TRANSPARENT_BACKGROUND' });
  });

  test('sanitizes stable output basenames', () => {
    assert.equal(sanitizeBasename('  ../../Quarter: 4 Résumé  '), 'Quarter-4-Resume');
    assert.throws(() => sanitizeBasename('...'), { message: 'CLI_USAGE' });
  });

  test('accepts exclusive all-view selection and sorts sanitized collisions by ID', async () => {
    const fixture = await readFile(path.join(process.cwd(), 'test/fixtures/synthetic/batch-collisions.xml'), 'utf8');
    assert.equal((parseArguments(['export', 'model.xml', '--all-views', '--format', 'svg',
      '--output-dir', 'out']) as { allViews?: boolean }).allViews, true);
    assert.throws(() => parseArguments(['export', 'model.xml', '--all-views', '--view-id', 'x',
      '--format', 'svg', '--output-dir', 'out']), { message: 'CLI_USAGE' });
    const views = listBatchViews(fixture);
    assert.deepEqual(views.map(({ id }) => id), ['view-a', 'view-b', 'view-z']);
    assert.equal(new Set(views.map(({ basename }) => basename.toLowerCase())).size, 3);
    assert.equal(views[0].basename, 'Resume-Q4');
    assert.ok(views.every(({ basename }) => basename.length <= 80 && !basename.includes('/')));
    assert.deepEqual(listBatchViews(fixture), views);
    const meff = await readFile(path.join(process.cwd(), 'test/fixtures/synthetic/dto-export-view.xml'), 'utf8');
    assert.deepEqual(listBatchViews(meff).map(({ id, name }) => ({ id, name })),
      [{ id: 'view-dto-export', name: 'Synthetic Application View' }]);
    const longName = listBatchViews(fixture.replace('name="Résumé : Q4"',
      `name="${'Long '.repeat(50)}"`));
    assert.ok(longName.every(({ basename }) => basename.length <= 80));
    assert.throws(() => listBatchViews(fixture.replace('id="view-b"', 'id="view-a"')),
      { message: 'BATCH_VIEWS_INVALID' });
  });
});

describe('atomic outputs', () => {
  test('writes binary content atomically and preserves mode', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-atomic-'));
    try {
      const file = path.join(directory, 'view.png');
      await writeFile(file, Buffer.from('old'), { mode: 0o640 });
      await chmod(file, 0o640);
      const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
      await writeAtomic(file, bytes);
      assert.deepEqual(await readFile(file), Buffer.from(bytes));
      assert.equal((await stat(file)).mode % 0o1000, 0o640);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('rolls back outputs when a later atomic write fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-rollback-'));
    try {
      const svg = path.join(directory, 'view.svg');
      await writeFile(svg, 'original');
      await writeFile(path.join(directory, `.view.png.${process.pid}.tmp`), 'collision');
      await assert.rejects(writeArtifacts(directory, 'view', {
        svg: '<svg/>', png: Uint8Array.from([1, 2, 3])
      }), { message: 'OUTPUT_WRITE_FAILED' });
      assert.equal(await readFile(svg, 'utf8'), 'original');
      await assert.rejects(readFile(path.join(directory, 'view.png')));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('publishes manifest last and restores prior files after failed manifest write', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-batch-rollback-'));
    try {
      const old = path.join(directory, 'view.svg');
      await writeFile(old, 'old');
      await writeFile(path.join(directory, 'manifest.json'), 'previous manifest');
      await writeFile(path.join(directory, `.manifest.json.${process.pid}.tmp`), 'collision');
      await assert.rejects(writeBatchArtifacts(directory, [
        { filename: 'view.svg', contents: 'new' }, { filename: 'fresh.png', contents: Uint8Array.of(1) }
      ], '{}', path.join(directory, 'model.xml')), { message: 'OUTPUT_WRITE_FAILED' });
      assert.equal(await readFile(old, 'utf8'), 'old');
      await assert.rejects(readFile(path.join(directory, 'fresh.png')));
      assert.equal(await readFile(path.join(directory, 'manifest.json'), 'utf8'), 'previous manifest');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('rejects symlink directory ancestry and output targets', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'archimate-batch-link-'));
    try {
      await mkdir(path.join(directory, 'real'));
      await symlink(path.join(directory, 'real'), path.join(directory, 'link'));
      const files = [{ filename: 'view.svg', contents: '<svg/>' }];
      await assert.rejects(writeBatchArtifacts(path.join(directory, 'link'), files, '{}', 'model.xml'),
        { message: 'OUTPUT_WRITE_FAILED' });
      await symlink(path.join(directory, 'outside'), path.join(directory, 'real', 'view.svg'));
      await assert.rejects(writeBatchArtifacts(path.join(directory, 'real'), files, '{}', 'model.xml'),
        { message: 'OUTPUT_WRITE_FAILED' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('manifest records canonical dimensions and per-format content hashes', () => {
    const views = [{ id: 'view-a', name: 'Synthetic', basename: 'Synthetic' }];
    const svg = '<svg width="20" height="10" viewBox="2 3 20 10"></svg>';
    const result = prepareBatch(views, [{ svg, png: Uint8Array.of(1, 2) }], ['svg', 'png']);
    const manifest = JSON.parse(result.manifest);
    assert.equal(manifest.schemaVersion, 1);
    assert.deepEqual(manifest.entries[0].outputs.map((item: { path: string }) => item.path),
      ['Synthetic.svg', 'Synthetic.png']);
    assert.deepEqual(manifest.entries[0].outputs[0].dimensions, { width: 20, height: 10 });
    assert.match(manifest.entries[0].outputs[1].sha256, /^[a-f0-9]{64}$/);
  });
});

test('browser contexts abort every network route', async () => {
  let pattern = '';
  let aborted = false;
  const context = {
    route: async (candidate: string, handler: (route: { abort(): Promise<void> }) => Promise<void>) => {
      pattern = candidate;
      await handler({ abort: async () => { aborted = true; } });
    }
  };
  await blockNetwork(context as unknown as BrowserContext);
  assert.equal(pattern, '**/*');
  assert.equal(aborted, true);
});
