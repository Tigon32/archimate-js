import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type { ExportArtifacts, ExportFormat } from './types.mjs';

const MAX_XML_BYTES = 1_048_576;
const PRIVATE_FILE_MODE = 0o600;

export async function readBoundedXml(filePath: string): Promise<string> {
  let handle;
  try {
    handle = await open(filePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('INPUT_READ_FAILED');
    if (stat.size > MAX_XML_BYTES) throw new Error('INPUT_SIZE_LIMIT');
    const bytes = Buffer.alloc(MAX_XML_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_XML_BYTES) throw new Error('INPUT_SIZE_LIMIT');
    return bytes.subarray(0, bytesRead).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message === 'INPUT_SIZE_LIMIT') throw error;
    throw new Error('INPUT_READ_FAILED');
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function findChrome(explicitPath?: string): Promise<string> {
  const pathCandidates = String(process.env.PATH || '').split(path.delimiter).flatMap((directory) => [
    path.join(directory, 'google-chrome'),
    path.join(directory, 'chromium'),
    path.join(directory, 'chromium-browser')
  ]);
  const configured = explicitPath ?? process.env.CHROME_BIN;
  const candidates = configured ? [configured] : [
    ...pathCandidates, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through fixed candidates without exposing local paths.
    }
  }
  throw new Error('BROWSER_NOT_FOUND');
}

export async function writeAtomic(filePath: string, contents: string | Uint8Array): Promise<void> {
  const absolute = path.resolve(filePath);
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${process.pid}.tmp`);
  let replacementMode = PRIVATE_FILE_MODE;
  let handle;
  try {
    const destination = await lstat(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (destination?.isFile()) replacementMode = destination.mode % 0o1000;
    handle = await open(temporary, 'wx', PRIVATE_FILE_MODE);
    await handle.writeFile(contents);
    await handle.chmod(replacementMode);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, absolute);
  } catch {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw new Error('OUTPUT_WRITE_FAILED');
  }
}

type PreviousOutput = { path: string; contents?: Uint8Array };

async function snapshot(filePath: string): Promise<PreviousOutput> {
  try {
    const metadata = await lstat(filePath);
    if (!metadata.isFile()) throw new Error('OUTPUT_WRITE_FAILED');
    return { path: filePath, contents: await readFile(filePath) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: filePath };
    throw new Error('OUTPUT_WRITE_FAILED');
  }
}

async function rollback(outputs: PreviousOutput[]): Promise<void> {
  for (const output of outputs.reverse()) {
    if (output.contents) {
      await writeAtomic(output.path, output.contents);
    } else {
      await rm(output.path, { force: true });
    }
  }
}

export async function writeArtifacts(
  directory: string,
  basename: string,
  artifacts: ExportArtifacts
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const entries = Object.entries(artifacts) as Array<[ExportFormat, string | Uint8Array]>;
  const previous = await Promise.all(entries.map(([format]) => snapshot(path.join(directory, `${basename}.${format}`))));
  const committed: PreviousOutput[] = [];
  try {
    for (let index = 0; index < entries.length; index++) {
      await writeAtomic(previous[index].path, entries[index][1]);
      committed.push(previous[index]);
    }
  } catch {
    try {
      await rollback(committed);
    } catch {
      throw new Error('OUTPUT_CLEANUP_FAILED');
    }
    throw new Error('OUTPUT_WRITE_FAILED');
  }
}
