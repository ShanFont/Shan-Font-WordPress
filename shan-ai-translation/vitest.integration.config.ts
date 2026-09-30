import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@sat/database': path.resolve('packages/database/src/index.ts'),
      '@sat/contracts': path.resolve('packages/contracts/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts', 'apps/api/src/**/*.e2e.test.ts'],
    setupFiles: ['tests/integration/env.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 120000,
  },
});
