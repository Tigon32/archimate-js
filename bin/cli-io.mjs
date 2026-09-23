import { lstat, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const PRIVATE_FILE_MODE = 0o600;

export async function writeAtomic(filePath, contents) {
  const absolute = path.resolve(filePath);
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${process.pid}.tmp`);
  let replacementMode = PRIVATE_FILE_MODE;
  let handle;

  try {
    const destination = await lstat(absolute).catch((error) => {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    });
    if (destination?.isFile()) replacementMode = destination.mode % 0o1000;

    handle = await open(temporary, 'wx', PRIVATE_FILE_MODE);
    await handle.writeFile(contents, 'utf8');
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
