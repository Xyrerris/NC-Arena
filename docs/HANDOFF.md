# Handoff — Phase 5, mid-flight

**As of 2026-09-23.** Branch: `claude/backend-data-management-w98hph` (see CLAUDE.md — all work goes
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

Six commits carry it:

| Commit    | What it settled                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `06fd643` | The client's push half: wire schemas, domain → DTO mappers, `pushRoster` behind `RosterSink`                |
| `a63c4bd` | `POST /v1/roster/sync` made idempotent — `players.client_id` + a unique index                               |
| `d8732e9` | `syncRoster` in the repository, and `LOCAL` → `REMOTE` as an id rewrite that keeps records                  |
| `5c5b792` | The setup gate: `AccountGateway`, `RemoteAccountGateway`, the `core/data` key seam, `features/accountSetup` |
| `08ab09f` | Pull-to-refresh calls `syncRoster` through a TanStack mutation; the one `QueryClient` lands in `_layout`    |

`npm run verify` is green: 601 tests across both Jest projects, 94.68 % statements against a 93 %
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
  one mutation is `syncMutation` in `core/data`, the one `QueryClient` is `arenaQueryClient` beside
  the repository (it started in `_layout.tsx`; the periodic task moved it), and there is no
  `useQuery` anywhere. `useRoster` sets `retry: 0` with the reasoning written down; the periodic
  task sets its own.
- ~~**The indicator, the banner and "updated N ago"** (decision 2).~~ **Done.** Only the reads feed
  `failure` now; `sync.error` is a banner with its own retry. **Pull-to-refresh had to ship with
  it** — there was no such gesture anywhere in the app, and the error screen's TRY AGAIN was the
  only thing that could fire a sync. `lastSyncedAt` sits beside `season` in `core/prefs`, stamped
  where a snapshot is _applied_ rather than where a request succeeded.
- ~~**The periodic refresh.**~~ **Done, not yet seen running on a device.** The task is
  `core/data/backgroundSync.ts`; its body is `runBackgroundSync` in `core/data/syncMutation.ts`,
  proven in Node. Three things about it will bite whoever touches it:
  - **It is defined from the entry, not from a route.** `package.json`'s `main` is now `index.ts`,
    which imports `expo-router/entry` and then the task module. WorkManager wakes a closed app
    headless, and no route — not even `_layout.tsx` — is evaluated then; a `defineTask` beside the
    layout would not exist on the one run it is for. The body awaits `arenaDbReady` for the same
    reason: there is no splash screen holding a headless run until the migrations finish.
  - **It shares the pull's mutation.** Same key, same `scope`, same `mutationFn`
    (`syncMutation`), on the same `QueryClient` — which moved from `_layout.tsx` to
    `arenaRepository.ts` so both callers can reach it. The scope queues a pull behind a running
    background sync instead of beside it; `header.isSyncing` reads `useIsMutating` on the key, so
    the badge _and_ the pull-to-refresh spinner show a background sync with no new UI. A
    background failure sets no banner — nobody asked for that sync.
  - **Policy:** `retry: 2` with TanStack's backoff (`BACKGROUND_SYNC_POLICY`), a 60-minute
    minimum interval, skipped while `needsAccount()` or while a sync is already in flight.
    Registered from `_layout.tsx` once the database is ready, and **unregistered** when the build
    has no URL.

  What is not proven: that WorkManager actually fires it on the emulator. In a debug build,
  `BackgroundTask.triggerTaskWorkerForTestingAsync()` runs it on demand — that is the check to do
  once the URL is on.

- **Turn the URL on.** Nothing blocks it any more: the gate exists, the periodic sync exists, and
  `0001_client_id.sql` is applied to the live database (see "Operational").
- **Run the migrations on every redeploy, automatically.** Today a deploy that carries a migration
  needs somebody to open the `app` container's console in Coolify and run
  `node dist/db/migrate.js` by hand, and between the redeploy and that command every sync answers 500. The container already ships what the command needs (`dist/db/migrations` is copied in the
  Dockerfile), so the fix is to run it before the server starts — a `CMD` of
  `node dist/db/migrate.js && node dist/index.js`, or Coolify's pre/post-deployment command.
  Decide what a failed migration does (the `&&` form refuses to start the new server, which keeps
  the old one serving only if Coolify's health check holds the rollout back — check that it does).

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
- **A failed sync is a banner; a failed _query_ is still the `error` state.** The split is in
  `useRoster`'s `failure`, which reads `roster.error ?? viewer.error` and deliberately **not**
  `sync.error`. Putting the sync back in there undoes the owner's decision 2 in one line, and the
  screen it produces looks reasonable in every test that does not go offline.
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
  container's console in Coolify, right after the redeploy — until the item above automates it. Not
  `npm run db:migrate` — `tsx` is not in the production image and `src/` is not copied into it.
- **`0001_client_id.sql` is applied to the live database** — the owner ran it from the container's
  terminal on 2026-09-23. The live schema now matches `applyRosterSync`.
- Nothing backs up the Postgres volume. The `recoveryCode` shown at account creation is the only way
  a second device ever joins that account.
