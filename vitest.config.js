import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false, // tests share real DB state — run files serially
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
