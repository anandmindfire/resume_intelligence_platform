import { defineConfig } from 'vitest/config';

/** Root config: runs every workspace project in one process (`pnpm test:unit`, `pnpm test:coverage`). */
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*-node', 'apps/frontend-dashboard'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/src/test/**',
        '**/src/index.ts',
        '**/src/main.tsx',
        '**/src/types/**',
        '**/*.d.ts',
      ],
      reporter: ['text-summary', 'html', 'lcov'],
      // Floors sit below current coverage (~99% lines, ~96% branches) to catch regressions, not to chase a number.
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
