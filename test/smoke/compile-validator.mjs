import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const executable = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
await rm('dist/validator', { recursive: true, force: true });
const result = await new Promise((resolve) => {
  const child = spawn(executable, ['-p', 'tsconfig.validator.json'], { stdio: 'inherit' });
  child.on('error', () => resolve(1));
  child.on('exit', (code) => resolve(code ?? 1));
});

if (result !== 0) process.exit(result);

await mkdir('dist/validator', { recursive: true });
await writeFile('dist/validator/package.json', '{"type":"module"}\n', { mode: 0o644 });
console.log('TypeScript validator compile smoke test passed');
