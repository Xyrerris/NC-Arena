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
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { DATABASE_NAME } from './constants';
import migrations from './migrations/migrations';
import type { ArenaDatabase } from './queries';
import { refoldPlayerNames } from './write';

export const expoDatabase = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

const expoDrizzle = drizzle(expoDatabase);

export const arenaDb: ArenaDatabase = expoDrizzle;

/**
 * Everything that has to happen to the database before a screen may read it: the committed
 * migrations, and then the `name_folded` repair (ADR-0032).
 *
 * Sequenced as one promise at module scope rather than as two hooks, because the order
 * between them is not React's business — the repair reads a column the migration has to have
 * added, and expressing that as "an effect that watches another hook's success flag" makes a
 * hard requirement look like a coincidence of render timing. Drizzle exports `migrate` as a
 * plain function alongside `useMigrations` precisely so this is available.
 *
 * The repair is inside the gate rather than after it because every name lookup in the app
 * reads that column. A roster rendered mid-repair is a roster whose search cannot find half
 * of it — the defect this phase exists to remove, not a transient worth tolerating. It is
 * idempotent and, after the first launch, one scan with no writes.
 */
const arenaDbReady: Promise<void> = migrate(expoDrizzle, migrations).then(() => {
  refoldPlayerNames(arenaDb);
});

/**
 * `arenaDbReady` as render state. The root layout holds the splash screen until `success`,
 * so no screen ever queries a table that does not exist yet (§7), and none queries a fold
 * that has not been written yet either.
 *
 * A failure in either step is reported rather than swallowed: a database whose folds are
 * wrong is one whose search and duplicate guard are wrong, and carrying on would hide that
 * behind screens that look like they are working.
 */
export const useArenaMigrations = (): { success: boolean; error: Error | undefined } => {
  const [state, setState] = useState<{ success: boolean; error: Error | undefined }>({
    success: false,
    error: undefined,
  });

  useEffect(() => {
    let watching = true;
    void arenaDbReady.then(
      () => {
        if (watching) setState({ success: true, error: undefined });
      },
      (cause: unknown) => {
        if (watching) {
          setState({
            success: false,
            error: cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
      },
    );
    return () => {
      watching = false;
    };
  }, []);

  return state;
};

export { useLiveQuery } from 'drizzle-orm/expo-sqlite';
