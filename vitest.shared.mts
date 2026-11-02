import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const WORKSPACE_PACKAGES = ['config', 'logger', 'queue-lib', 'resume-nlp', 'role-matching'];

/** Resolve workspace packages to their TypeScript sources so tests don't need a prior build. */
export const workspaceAliases = Object.fromEntries(
  WORKSPACE_PACKAGES.map((name) => [
    `@resume-platform/${name}`,
    path.join(rootDir, 'packages', name, 'src', 'index.ts'),
  ])
);

/** Base Vitest project config shared by every Node package and service. */
export const nodeProjectConfig = defineProject({
  resolve: {
    alias: workspaceAliases,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    env: {
      LOG_LEVEL: 'silent',
    },
  },
});
