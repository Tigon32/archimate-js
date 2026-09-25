import { mkdir, writeFile } from 'node:fs/promises';

await writeFile('dist/model-dto/package.json', '{"type":"module"}\n');
await mkdir('dist/diagram-js-adapter', { recursive: true });
await writeFile('dist/diagram-js-adapter/package.json', '{"type":"module"}\n');
