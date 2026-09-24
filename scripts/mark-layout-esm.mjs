import { writeFile } from 'node:fs/promises';

await writeFile('dist/layout/package.json', '{"type":"module"}\n');
