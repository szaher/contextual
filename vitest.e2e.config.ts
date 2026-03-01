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
      'tests/e2e/**/*.test.ts',
    ],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 15000,
  },
});
