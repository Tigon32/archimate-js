export default {
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: [
        'text',
        'lcov'
      ],
      all: false,
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0
      }
    }
  }
};
