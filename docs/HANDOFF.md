# Handoff — Phase 5, mid-flight

**As of 2026-09-21.** Branch: `claude/backend-data-management-w98hph` (see CLAUDE.md — all work goes
there until the owner says otherwise).

This file says where Phase 5 stopped and which decisions are already made, so the next session
argues about the right things. It is not a substitute for ADR-0035 and its five addenda in
DECISIONS.md, which carry the reasoning; this is the map.

## Where things stand

The backend is **built, deployed and verified**. It runs on the owner's OVH VPS through Coolify as a
Docker Compose resource with `backend/` as its base directory. The owner has confirmed `/health`,
the TLS certificate, the migrations and account creation against the live service.

The client can do the **whole round trip** — pull, push, adopt the ids the server assigns, set the
viewer — and the **setup gate is now the one part of it wired to a screen**: with a URL configured,
a launch with no stored key shows `features/accountSetup` instead of the roster, and nothing else
runs until this device is paired. `EXPO_PUBLIC_API_URL` is still unset everywhere, so the app builds
no source, no gateway and therefore no gate, and behaves exactly as ADR-0021 describes: a ladder
that starts empty and is filled by hand.

Five commits carry it:

| Commit    | What it settled                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `06fd643` | The client's push half: wire schemas, domain → DTO mappers, `pushRoster` behind `RosterSink`                |
| `a63c4bd` | `POST /v1/roster/sync` made idempotent — `players.client_id` + a unique index                               |
| `d8732e9` | `syncRoster` in the repository, and `LOCAL` → `REMOTE` as an id rewrite that keeps records                  |
| `5c5b792` | The setup gate: `AccountGateway`, `RemoteAccountGateway`, the `core/data` key seam, `features/accountSetup` |
| `08ab09f` | Pull-to-refresh calls `syncRoster` through a TanStack mutation; the one `QueryClient` lands in `_layout`    |

`npm run verify` is green: 575 tests across both Jest projects, 94.51 % statements against a 93 %
threshold.

## Decided already — do not reopen without the owner

The owner answered these in session. They are settled:

1. **A sync is push-then-pull as one operation**, fired by pull-to-refresh and by the periodic
   `expo-background-task` — **not** on every local write. Local rows stay `LOCAL` until the next
   sync.
2. **The roster does not block during a sync.** Data stays on screen; a minimal, non-blocking
   indicator (a small spinner or badge) says an operation is running; plus the "updated N ago" the
   roadmap already asks for. A failure is a recoverable banner, never a crash or a blank screen —
   that one is an exit criterion, not a preference.
3. **First launch asks for a recovery code.** Entered and valid → `POST /v1/accounts/link`, which
   returns a fresh API key for this device. Left empty → `POST /v1/accounts`, which mints an account
   and shows the API key and recovery code **once**.
4. **`EXPO_PUBLIC_API_URL` is the off switch**, and the API key lives in `core/prefs` (MMKV) beside
   `viewerId`. The setup gate from (3) is what guarantees a key exists before the roster is
   reachable — nothing else guards that window.

One tension the owner and I agreed on: the roadmap's "the `features/` diff for this phase is empty"
reads as _swapping the data source must not force feature changes_, and stays true. The setup screen
and the sync indicator are additive UI the owner asked for, not the swap forcing anyone's hand.

## What to pick up

Roughly in dependency order. All of it is above the data layer; none of it needs the ports to change.

- ~~**The setup gate (decision 3).**~~ **Done.** `AccountGateway` (core/common) is implemented by
  `RemoteAccountGateway` over the two unauthenticated endpoints; `createAccount`/`linkAccount` on
  the repository store the key; `useNeedsAccount` and `ArenaGate` in `src/app/_layout.tsx` decide
  whether the gate opens. **Read the fifth addendum to ADR-0035 before touching it** — the gate
  latches its decision at mount rather than watching `needsAccount`, and the reason is the kind of
  bug that looks like success.
- ~~**`useRoster` calls `syncRoster`** through TanStack Query, on pull-to-refresh.~~ **Done.** The
  one mutation is in `useRoster`, the one `QueryClient` is in `_layout.tsx`, and there is no
  `useQuery` anywhere. `retry` is set to 0 there with the reasoning written down — **that is the
  knob the periodic task should turn up**, not a default to leave alone.
- **The indicator, the banner and "updated N ago"** (decision 2) — **now the next thing, and more
  urgent than it was.** A sync failure currently takes the roster down to `{ kind: 'error' }`, which
  still meets the roadmap's exit criterion (a recoverable error, not a crash or a blank screen) but
  **not** decision 2's "data stays on screen, a failure is a banner". That was harmless while
  `refresh()` was a no-op and could not fail; it is not harmless now that pull-to-refresh makes a
  real network call that will fail routinely. The fix is in `useRoster`'s `state` memo: `sync.error`
  should stop feeding `failure` and become a line above the list, the way `recordError` already is.
  `preferences.getSeason()` is the precedent for storing a scalar the snapshot carried; a "last
  synced at" would be the same shape.
- **The periodic refresh.** `expo-background-task` is installed but referenced nowhere, and its
  config-plugin declaration was deliberately removed from `app.config.ts` in 4.10 because it was a
  no-op on Android — ADR-0034 decision 5 says it goes back **beside the code that uses it**. That is
  this work.
- **Turn the URL on.** The gate exists now, so this is unblocked — but see "Operational" below
  first: `0001_client_id.sql` has to be applied before the first device syncs, not after.

## Things that will cost you a day if you rediscover them

- **`POST /v1/roster/sync` is idempotent, and everything leans on that.** A replayed push is answered
  with the ids assigned the first time. Before `a63c4bd` it duplicated every row; reproduced against
  a real PostgreSQL 16 before fixing. If you touch `applyRosterSync`, the unique index on
  `(account_id, client_id)` and the read-before-write are what hold it up.
- **A head-to-head record cannot be pushed in the same sync that creates its players.** Both ends are
  uuids on the wire and a `LOCAL` id is not one, so a record against a hand-entered player reaches
  the server one sync later. It is not lost meanwhile — `replaceRoster` carries it across under the
  adopted id. Making it one round trip means letting a record name its ends by `clientId` and
  resolving them server-side: a real contract change, deliberately not made.
- **A first sync usually takes three round trips.** `RosterSnapshot.viewerId` is not optional and a
  fresh account has none, so the push returns no snapshot; the device seats the viewer with the id
  the push just assigned, then pulls. With no local viewer there is nothing to seat and nothing to
  apply, and the sync converges once somebody is the viewer.
- **`replaceRoster`'s third argument is load-bearing in two places.** An adopted id drops out of the
  kept set _and_ every record end is read through the map. Drop the second half and adopting a row
  silently discards every match played against it — the promise 4.10.2 exists to keep.
  `src/core/data/rosterSync.test.ts` fails if you break either half; that was checked by breaking
  them.
- **An async handler needs an `async` act scope, in every screen and hook test.** A synchronous
  `act(() => { result.current.onEvent(...) })` around a handler that starts a promise lets that
  promise settle outside any act scope, and RNTL then corrupts the renderer **for the rest of the
  file** — the next `render` produces an empty tree and the failure lands on an unrelated test with
  a message about a missing testID. It cost two bisects in one session. `await act(async () => ...)`
  everywhere, and suspect ordering first when a test passes alone and fails in the file.
- **The setup gate latches at mount, and must keep doing so.** The API key is stored the instant
  `POST /v1/accounts` answers, so `needsAccount()` goes false **while the recovery code is still on
  screen**. A gate that watched it instead of latching would close over the only time that code is
  ever shown — and the server keeps only its hash, so the account would be permanently unreachable
  from any second device, with the app looking like setup had succeeded.
  `AccountSetupScreen.test.tsx`'s "keeps the code on screen although the key is already stored"
  fails if you swap the latch for a live read.
- **`editedPlayers` is always empty**, and that is the product: ADR-0020 lets the user edit only a
  `LOCAL` row, so no screen can produce an edit to a row the server owns. The wire carries the case
  because a second device can reach it.
- **`backend/` is a second, independent package.** Its own `package.json` and `tsconfig.json`, and
  `npm run verify` at the root does **not** touch it. Run `npm run typecheck` and `npm run build`
  inside `backend/` yourself. It has no test runner at all — the backend's behaviour was verified by
  driving a real Postgres by hand, which is a gap somebody should close.
- **`npm run db:generate` needs no database**, and diffs against `migrations/meta/*_snapshot.json`.
  The baseline snapshot exists now; before `a63c4bd` it did not, and generation silently re-emitted
  the whole schema as the next migration.

## Operational

- A deploy that carries a new migration needs `node dist/db/migrate.js` run from the `app`
  container's console in Coolify, right after the redeploy. Not `npm run db:migrate` — `tsx` is not
  in the production image and `src/` is not copied into it.
- **`0001_client_id.sql` has not been applied to the live database yet** unless the owner has done it
  since 2026-09-21. Between the redeploy and that command, `applyRosterSync` writes to a column that
  does not exist and every sync answers 500. Harmless while no client calls it; stops being harmless
  the moment the setup gate ships.
- Nothing backs up the Postgres volume. The `recoveryCode` shown at account creation is the only way
  a second device ever joins that account.
