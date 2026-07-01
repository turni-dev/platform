import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      },
      exclude: [
        '**/*.spec.ts',
        '**/main.ts',
        'dist/**',
        'node_modules/**'
      ]
    },
    exclude: ['dist/**', 'node_modules/**'],
    globals: true,
    passWithNoTests: false
  }
});
