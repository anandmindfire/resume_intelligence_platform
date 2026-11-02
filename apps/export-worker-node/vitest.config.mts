import { defineProject, mergeConfig } from 'vitest/config';
import { nodeProjectConfig } from '../../vitest.shared.mjs';

export default mergeConfig(nodeProjectConfig, defineProject({ test: { name: 'export-worker-node' } }));
