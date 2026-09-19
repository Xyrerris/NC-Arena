/**
 * The app's single repository instance. **Device-only** — it wires the native-backed
 * implementations together, so it is not re-exported from `src/core/data/index.ts` for
 * the same reason `core/db/client.ts` and `core/prefs/mmkvPreferences.ts` are not: the
 * Node test project must stay able to import the repository itself (§10).
 *
 * Everything here is an argument to `createRosterRepository`, which is the point. Tests pass
 * a `better-sqlite3` database, an in-memory preference store and a stub source.
 *
 * **`EXPO_PUBLIC_API_URL` is the off switch.** Unset, nothing here builds a source, the
 * repository has no upstream, and the app behaves exactly as ADR-0021 describes it: a ladder
 * that starts empty, is filled by hand, and whose `refresh()` has genuinely nothing to do.
 * Set, the same object serves as both ports — `RemoteRosterSource` implements `RosterSource`
 * and `RosterSink`, because the backend answers in both directions (ADR-0035, decision 3).
 * Metro inlines `EXPO_PUBLIC_` variables at bundle time, so this is a build-time choice, the
 * same door `src/app/catalogue.tsx` uses for its own flag.
 *
 * The **key** is read per request rather than captured here, and that is not a detail: a
 * device has no API key until the user has created an account or entered a recovery code, so
 * a key read at module load would be `null` for the whole run and every request would go out
 * unauthenticated. Passing the getter means pairing takes effect on the next request rather
 * than on the next launch.
 *
 * Nothing guards against the window where a URL is configured and no key is stored yet — the
 * setup flow does, by standing in front of the roster until one is. Until that flow exists,
 * leaving the variable unset is what keeps this off.
 */

import { RemoteRosterSource } from '../network';
import { arenaDb } from '../db/client';
import { mmkvPreferences } from '../prefs/mmkvPreferences';
import { createRosterRepository } from './rosterRepository';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

const backend =
  apiUrl === undefined || apiUrl === ''
    ? undefined
    : new RemoteRosterSource(apiUrl, () => mmkvPreferences.getApiKey());

export const arenaRepository = createRosterRepository({
  db: arenaDb,
  source: backend,
  sink: backend,
  preferences: mmkvPreferences,
});
