import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next.js apps must keep `jsx: "preserve"` in their tsconfig, and the
  // transform refuses to compile JSX under it. Pinning the runtime here lets
  // their components be rendered in tests instead of read as source text.
  oxc: { jsx: { runtime: 'automatic' } },
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
