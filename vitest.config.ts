import { defineConfig } from 'vitest/config'
// Share one React instance across DSH client packages and tests.
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      // Baseline on native Windows (42 POSIX-only tests skipped): 93.07 statements, 85.63 branches,
      // 93.09 functions, 96.19 lines. The margin keeps the gate meaningful while it passes on POSIX,
      // where a different set of platform-specific branches runs.
      thresholds: { statements: 92, branches: 84, functions: 92, lines: 95 },
    },
  },
})
