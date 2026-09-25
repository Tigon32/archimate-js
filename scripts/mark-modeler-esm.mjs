import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await mkdir('dist/modeler', { recursive: true });
await cp('.ci-modeler-build/src/modeler', 'dist/modeler', { recursive: true });
await writeFile('dist/modeler/package.json', '{"type":"module"}\n');
await mkdir('dist/diagram-js-adapter', { recursive: true });
await cp('.ci-modeler-build/src/diagram-js-adapter', 'dist/diagram-js-adapter', { recursive: true });
const enginePath = 'dist/diagram-js-adapter/modeler-engine.js';
const engineSource = await readFile(enginePath, 'utf8');
await writeFile(enginePath, engineSource.replace("'../../lib/Modeler'", "'../../lib/Modeler.ts'"));
await writeFile('dist/diagram-js-adapter/package.json', '{"type":"module"}\n');
await rm('.ci-modeler-build', { recursive: true, force: true });
