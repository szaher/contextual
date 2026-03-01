import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@ctxl/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@ctxl/daemon': resolve(__dirname, 'packages/daemon/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    exclude: [
      'tests/e2e/**/*.test.ts',
      'node_modules',
      'dist',
    ],
    globals: true,
    testTimeout: 10000,
  },
});
