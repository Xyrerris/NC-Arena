/**
 * drizzle-kit configuration. Generated SQL is committed (ARCHITECTURE.md §7) so schema
 * drift shows up in a diff instead of at runtime on a device.
 *
 * `driver: 'expo'` also emits `migrations.js`, which bundles the SQL into the JS bundle —
 * `useMigrations` runs it once from the root layout, behind the splash screen.
 */

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/core/db/schema.ts',
  out: './src/core/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
