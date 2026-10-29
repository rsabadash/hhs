import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/api/test/**/*.integration.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
