import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '../../lib/Modeler.js',
        replacement: fileURLToPath(new URL('./lib/Modeler.ts', import.meta.url))
      }
    ]
  },
  test: {
    environment: 'node',
    include: [
      'test/contract/**/*.test.mts',
      'test/unit/**/*.test.mjs',
      'test/unit/**/*.test.mts'
    ],
    reporters: 'default',
    coverage: {
      include: ['src/validator/**/*.ts'],
      reporter: ['text']
    }
  }
});
