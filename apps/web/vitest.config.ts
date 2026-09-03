import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Loads .env.local so the database suites can reach the same Postgres the app does.
    // They skip themselves when DATABASE_URL is absent, which is how CI runs.
    setupFiles: ['./src/testing/env.ts'],
    // The integration suites share one database and create rows with fixed ids; running the
    // files in parallel would have them clean up under each other.
    fileParallelism: false,
    // Xata is a network away and a repository call is a dozen round trips. The default 5 s
    // measures the connection, not the code.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
