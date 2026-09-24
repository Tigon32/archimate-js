import { writeFile } from 'node:fs/promises';

await writeFile('dist/model-dto/package.json', '{"type":"module"}\n');
