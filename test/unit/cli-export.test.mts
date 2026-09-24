import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'vitest';
import type { BrowserContext } from 'playwright-core';

import { parseArguments, sanitizeBasename } from '../../src/cli/arguments.mjs';
import { blockNetwork } from '../../src/cli/browser.mjs';
import { writeArtifacts, writeAtomic } from '../../src/cli/io.mjs';

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
