/**
 * The `expo-sqlite` binding. **Device-only** — importing this file in the Node test
 * project fails, because `expo-sqlite` is a native module Metro resolves and Node cannot.
 * That is why `src/core/db/index.ts` does not re-export it, and why every query builder
 * lives in a driver-agnostic file instead (ARCHITECTURE.md §10).
 *
 * `enableChangeListener` is load-bearing rather than an optimisation: it is what makes
 * `useLiveQuery` re-run after a write. Without it the UI reads SQLite once and then never
 * notices a sync, which looks exactly like an offline-first app that is quietly broken.
 */

import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';

import { DATABASE_NAME } from './constants';
import migrations from './migrations/migrations';
import type { ArenaDatabase } from './queries';

export const expoDatabase = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

export const arenaDb: ArenaDatabase = drizzle(expoDatabase);

/**
 * Runs the committed migrations once. The root layout holds the splash screen until this
 * resolves, so no screen ever queries a table that does not exist yet (§7).
 */
export const useArenaMigrations = () => useMigrations(arenaDb, migrations);

export { useLiveQuery } from 'drizzle-orm/expo-sqlite';
