import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    // The suites share one local database. Fixtures are unique per run, but running files one at a
    // time keeps failures readable and the concurrency tests meaningful.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    server: { deps: { inline: ['@bro-split/database'] } },
  },
});
