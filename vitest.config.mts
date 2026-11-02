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
    },
  },
});
