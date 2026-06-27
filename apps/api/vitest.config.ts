import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // We need the DATABASE_URL to be set. The CI/local dev .env at
    // apps/api/.env supplies it; vitest will not auto-load it though.
    // Tests should source it from process.env directly.
  },
});
