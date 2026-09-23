import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, '..', '..');

function readProjectFile(path) {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

describe('sensitive ArchiMate model logging', () => {
  it('does not log full imported XML or parsed model objects from BaseViewer', () => {
    const source = readProjectFile('lib/BaseViewer.js');

    expect(source).not.toContain('logger.log(xml);');
    expect(source).not.toContain('logger.log(parseResult);');
    expect(source).not.toContain('logger.log(model);');
  });
});
