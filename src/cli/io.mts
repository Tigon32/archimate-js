import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
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

/** Publish a complete batch and manifest as one rollback unit. */
export async function writeBatchArtifacts(
  directory: string,
  files: Array<{ filename: string; contents: string | Uint8Array }>,
  manifest: string,
  inputPath: string
): Promise<void> {
  try {
    const absolute = await prepareOutputDirectory(directory);
    const all = [...files, { filename: 'manifest.json', contents: manifest }];
    await publishBatchFiles(absolute, all, await canonicalInputPath(inputPath));
  } catch (error) {
    if (error instanceof Error && error.message === 'OUTPUT_CLEANUP_FAILED') throw error;
    throw new Error('OUTPUT_WRITE_FAILED');
  }
}

async function canonicalSystemPath(requested: string): Promise<string> {
  // Resolve only a verified OS-owned prefix. Resolving the entire path here
  // would hide caller-created symlinks below the selected output directory.
  for (const alias of ['/var', '/tmp']) {
    if ((requested === alias || requested.startsWith(`${alias}${path.sep}`)) &&
        await safeOutputAlias(alias)) {
      return `/private${requested}`;
    }
  }
  return requested;
}

async function canonicalInputPath(inputPath: string): Promise<string> {
  const absolute = path.resolve(inputPath);
  return realpath(absolute).catch(() => canonicalSystemPath(absolute));
}

async function prepareOutputDirectory(directory: string): Promise<string> {
  const absolute = await canonicalSystemPath(path.resolve(directory));
  const parts: string[] = [];
  let cursor = absolute;
  while (cursor !== path.dirname(cursor)) { parts.unshift(cursor); cursor = path.dirname(cursor); }
  for (const component of parts) {
    const item = await lstat(component).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (item && !item.isDirectory()) throw new Error('OUTPUT_WRITE_FAILED');
  }
  await mkdir(absolute, { recursive: true });
  return absolute;
}

async function safeOutputAlias(component: string): Promise<boolean> {
  if (process.platform !== 'darwin' || !['/var', '/tmp'].includes(component)) return false;
  try { return (await realpath(component)) === `/private${component}`; } catch { return false; }
}

async function publishBatchFiles(
  directory: string,
  all: Array<{ filename: string; contents: string | Uint8Array }>,
  inputPath: string
): Promise<void> {
    const names = new Set<string>();
    const previous: PreviousOutput[] = [];
    for (const file of all) {
      if (!file.filename || path.basename(file.filename) !== file.filename ||
          file.filename === '.' || file.filename === '..' ||
          names.has(file.filename.toLowerCase())) throw new Error('OUTPUT_WRITE_FAILED');
      names.add(file.filename.toLowerCase());
      const target = path.join(directory, file.filename);
      if (target === path.resolve(inputPath)) throw new Error('OUTPUT_WRITE_FAILED');
      previous.push(await snapshot(target));
    }

    const committed: PreviousOutput[] = [];
    try {
      for (let index = 0; index < all.length; index++) {
        await writeAtomic(previous[index].path, all[index].contents);
        committed.push(previous[index]);
      }
    } catch {
      try { await rollback(committed); } catch { throw new Error('OUTPUT_CLEANUP_FAILED'); }
      throw new Error('OUTPUT_WRITE_FAILED');
    }
}

type PartialGroup = { files: Array<{ filename: string; contents: string | Uint8Array }> };

async function preparePartialDirectory(directory: string): Promise<string> {
  try {
    return await prepareOutputDirectory(directory);
  } catch { throw new Error('OUTPUT_WRITE_FAILED'); }
}

function partialTarget(directory: string, filename: string, inputPath: string): string {
  if (!filename || path.basename(filename) !== filename || filename === '.' || filename === '..') {
    throw new Error('OUTPUT_WRITE_FAILED');
  }
  const target = path.join(directory, filename);
  if (target === path.resolve(inputPath) || filename.toLowerCase() === 'manifest.json') {
    throw new Error('OUTPUT_WRITE_FAILED');
  }
  return target;
}

/** Each view commits independently; manifest failure restores the whole request. */
export async function writePartialBatchArtifacts(
  directory: string, groups: PartialGroup[], inputPath: string,
  makeManifest: (failedIndexes: Set<number>) => string
): Promise<Set<number>> {
  const absolute = await preparePartialDirectory(directory);
  const canonicalInput = await canonicalInputPath(inputPath);
  const manifestPath = path.join(absolute, 'manifest.json');
  await snapshot(manifestPath);
  const committed: PreviousOutput[] = [];
  const failed = new Set<number>();
  const names = new Set<string>(['manifest.json']);
  try {
    for (let index = 0; index < groups.length; index++) {
      const previous: PreviousOutput[] = [];
      const current: PreviousOutput[] = [];
      try {
        for (const file of groups[index].files) {
          const target = partialTarget(absolute, file.filename, canonicalInput);
          if (names.has(file.filename.toLowerCase())) throw new Error('OUTPUT_WRITE_FAILED');
          names.add(file.filename.toLowerCase());
          previous.push(await snapshot(target));
        }
        for (let item = 0; item < previous.length; item++) {
          await writeAtomic(previous[item].path, groups[index].files[item].contents);
          current.push(previous[item]);
        }
        committed.push(...current);
      } catch {
        try { await rollback(current); } catch { throw new Error('OUTPUT_CLEANUP_FAILED'); }
        failed.add(index);
      }
    }
    await writeAtomic(manifestPath, makeManifest(failed));
    return failed;
  } catch (error) {
    try { await rollback(committed); } catch { throw new Error('OUTPUT_CLEANUP_FAILED'); }
    if (error instanceof Error && error.message === 'OUTPUT_CLEANUP_FAILED') throw error;
    throw new Error('OUTPUT_WRITE_FAILED');
  }
}
