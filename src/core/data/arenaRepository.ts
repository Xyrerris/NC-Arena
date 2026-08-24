/**
 * The app's single repository instance. **Device-only** — it wires the two native-backed
 * implementations together, so it is not re-exported from `src/core/data/index.ts` for
 * the same reason `core/db/client.ts` and `core/prefs/mmkvPreferences.ts` are not: the
 * Node test project must stay able to import the repository itself (§10).
 *
 * Everything here is an argument to `createRosterRepository`, which is the point. Tests
 * pass a `better-sqlite3` database, an in-memory preference store and a stub source;
 * Phase 5 adds the `source` line back, pointing at `core/network`.
 *
 * **There is no source today** (ADR-0021). The app starts with an empty ladder and is
 * filled by hand, so nothing here fetches. That the omission is one missing argument —
 * rather than a stub implementation returning nothing — is the honest encoding: a fake
 * source answering "no players" would be indistinguishable from a real one that had lost
 * them.
 */

import { arenaDb } from '../db/client';
import { mmkvPreferences } from '../prefs/mmkvPreferences';
import { createRosterRepository } from './rosterRepository';

export const arenaRepository = createRosterRepository({
  db: arenaDb,
  preferences: mmkvPreferences,
});
