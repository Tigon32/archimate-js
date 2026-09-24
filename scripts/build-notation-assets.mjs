import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../assets/archimate-4-kit/', import.meta.url);
const target = new URL('../lib/draw/notation.generated.js', import.meta.url);
const [tokens, css, symbols] = await Promise.all([
  readFile(new URL('tokens/tokens.json', root), 'utf8'),
  readFile(new URL('css/archimate.css', root), 'utf8'),
  readFile(new URL('svg/archimate-symbols.svg', root), 'utf8')
]);

// Keep the supplied source kit immutable. The browser and Node entrypoints
// consume this generated, local module without loading remote resources.
const output = `// Generated from assets/archimate-4-kit by scripts/build-notation-assets.mjs.\n` +
  `export const tokens = ${JSON.stringify(JSON.parse(tokens))};\n` +
  `export const css = ${JSON.stringify(css)};\n` +
  `export const symbols = ${JSON.stringify(symbols)};\n`;
await writeFile(target, output);
console.log(`Generated ${fileURLToPath(target)}`);
