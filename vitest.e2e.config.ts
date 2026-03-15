import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@ctxkit/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@ctxkit/daemon': resolve(__dirname, 'packages/daemon/src/index.ts'),
      '@ctxkit/mcp/client': resolve(__dirname, 'packages/mcp/src/client.ts'),
      '@ctxkit/mcp': resolve(__dirname, 'packages/mcp/src/index.ts'),
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
