import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // PGlite boots a whole Postgres in WebAssembly and replays the migrations once per file;
    // that is seconds on a cold machine, not the default 5.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
