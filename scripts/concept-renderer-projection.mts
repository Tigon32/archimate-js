import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CONCEPT_RECORDS,
} from '../src/language/concept-registry.mts';
import { renderConceptRendererProjection } from '../src/language/concept-renderer-projection.mts';

export { isConceptRendererProjectionCurrent, renderConceptRendererProjection } from
  '../src/language/concept-renderer-projection.mts';

const OUTPUT_PATH = resolve('lib/draw/concept-renderer.generated.mjs');

const run = (): void => {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--write') {
    throw new Error('Usage: node scripts/concept-renderer-projection.mts --check|--write');
  }
  const expected = renderConceptRendererProjection(CONCEPT_RECORDS);
  if (mode === '--check') {
    if (readFileSync(OUTPUT_PATH, 'utf8') !== expected) {
      throw new Error('Concept renderer projection is stale; run npm run generate:concept-renderer.');
    }
    return;
  }
  writeFileSync(OUTPUT_PATH, expected);
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
