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
 * The window where a URL is configured and no key is stored yet **is** guarded now: the
 * setup gate stands in front of the roster until one is (`needsAccount`), and the gateway
 * below is what lets it mint one. Both are built from the same flag, so a build with no URL
 * has no gate either — it is the hand-filled ladder ADR-0021 describes, and a sign-up screen
 * in front of it would be asking for an account the product does not have.
 */

import { RemoteAccountGateway, RemoteRosterSource } from '../network';
import { arenaDb } from '../db/client';
import { mmkvPreferences } from '../prefs/mmkvPreferences';
import { createRosterRepository } from './rosterRepository';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

const configured = apiUrl === undefined || apiUrl === '' ? undefined : apiUrl;

const backend =
  configured === undefined
    ? undefined
    : new RemoteRosterSource(configured, () => mmkvPreferences.getApiKey());

/**
 * The account endpoints, which take no key because they are how this device gets one. Built
 * from the same flag as the source: a build with no backend has no accounts either, and
 * `needsAccount` reads its absence as "never gate this app".
 */
const accounts = configured === undefined ? undefined : new RemoteAccountGateway(configured);

export const arenaRepository = createRosterRepository({
  db: arenaDb,
  source: backend,
  sink: backend,
  gateway: accounts,
  preferences: mmkvPreferences,
});
