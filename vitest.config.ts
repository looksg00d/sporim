import { defineConfig } from 'vitest/config';

// Root runner: every package/app owns its own vitest.config.ts and is picked up as a project.
// Coverage thresholds follow docs/09-phase0-plan.md (T0.4): domain 90, chain 85, web 60, global 80.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        '**/index.ts',
        '**/testing/**',
        '**/__tests__/**',
        'packages/config/**',
        'packages/testing/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'packages/domain/src/**': { lines: 90, functions: 90, branches: 90, statements: 90 },
        'packages/chain/src/**': { lines: 85, functions: 85, branches: 85, statements: 85 },
        'apps/web/src/**': { lines: 60, functions: 60, branches: 60, statements: 60 },
      },
    },
  },
});
