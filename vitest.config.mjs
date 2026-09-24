import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
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
