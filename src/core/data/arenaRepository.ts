/**
 * The app's single repository instance. **Device-only** — it wires the two native-backed
 * implementations together, so it is not re-exported from `src/core/data/index.ts` for
 * the same reason `core/db/client.ts` and `core/prefs/mmkvPreferences.ts` are not: the
 * Node test project must stay able to import the repository itself (§10).
 *
 * Everything here is an argument to `createRosterRepository`, which is the point. Tests
 * pass a `better-sqlite3` database, an in-memory preference store and a stub source;
 * Phase 5 swaps only the `source` line.
 */

import { arenaDb } from '../db/client';
import { mmkvPreferences } from '../prefs/mmkvPreferences';
import { localSeedRosterSource } from './localSeedRosterSource';
import { createRosterRepository } from './rosterRepository';

export const arenaRepository = createRosterRepository({
  db: arenaDb,
  source: localSeedRosterSource,
  preferences: mmkvPreferences,
});
