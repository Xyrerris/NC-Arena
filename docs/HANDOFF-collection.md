# Handoff — the collection tracker, mid-flight

**As of 2026-10-01.** Branch: `ccr-447f2719-u08rgd`, cut from `claude/backend-data-management-w98hph` at
`d6fa006`. It is **not merged and has no PR**. CLAUDE.md says all work goes on the backend branch;
the owner asked for a separate branch for this feature, so the two instructions disagree on purpose.
Say so in your first reply, and ask before merging or pushing to the backend branch — **a push to
that branch deploys the backend** (Coolify), migrations included.

This file is the map. The reasoning is in **ADR-0044** in DECISIONS.md; read it first.

## The feature

A section **parallel to the arena** that tracks the collection of the player marked as "me" and lists
what is missing to complete it. "Collection" is Nine Chronicles' own feature: lib9c's
`CollectionSheet.csv` has 942 collections, each a set of 1–6 items (equipment or costumes, by id)
that grants a permanent stat bonus once the avatar owns all of them.

## What exists

| Commit                | What it settled                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `736e1f0`             | `src/core/collection/`: sheet parser, `collectionStatus`/`missingItems`, ADR-0044                                  |
| `cc04a7f` … `5295562` | ADR-0044 findings from the 9CAPI, node and Mimir probes                                                            |
| `3d9b05b`             | `parseUnlockedCollectionIds`: Bencodex hex → set of ids, strict about shape                                        |
| `e0cac03`             | **Backend:** `accounts.viewer_avatar_*`, migration `0002`, `PUT`/`GET /v1/me/avatar`                               |
| `5b7dac3`             | **Client data:** `ViewerAvatar` model, preference + pending flag, `RosterSink.setViewerAvatar`, sync sends it last |
| `83511f0`             | **Screen:** `features/viewerAvatar`, rendered by `/me` beside the backup                                           |

`core/collection` is pure and registered as a `core-collection` element in `eslint.config.js`
(depends on `core-common` only; two probes in `scripts/check-boundaries.mjs`).

## The rules that are already decided (ADR-0044)

- **The chain is the truth; a manual tick is a provisional claim.** Statuses: `UNLOCKED`, `CLAIMED`
  (ticked, no chain read yet), `DISPUTED` (ticked, a complete chain read says no — shown, never
  erased), `MISSING`.
- **Only a complete, valid read is applied.** A failed or partial read is `null`, never an empty set.
- **Offline shows the stored state** with "updated N ago".
- **The sheet and item names ship in the bundle**, generated once, so it works offline.
- **The avatar address belongs to the viewer**, on the account, not on `Player`. Choosing a different
  viewer clears it, on the server and on the device.

## Verified facts (Heimdall, 2026-10-01)

Test avatar: `Xyrerris`, planet `heimdall`, `#1023`,
`0x1023d8f22c6f5a8701e56a95e18fb2dbe436b41f`, agent `0xD7E47C36F676922985eD5ca079579234D0027875`.

- **`#1023` is the start of the address** (a 4-hex prefix: a filter, not a key).
- **Mimir** (`https://mimir.nine-chronicles.dev/heimdall/graphql/`, Odin beside it, no key):
  `collection(address: "0x…") { ids }` → **442** ids. `sheet(sheetName: "CollectionSheet") { csv }`
  serves the game's sheets (118). `metadata(collectionName: "avatar") { latestBlockIndex }` says how far
  behind the chain it is.
- **A plain node** (`https://heimdall-rpc-1.nine-chronicles.com/graphql`, or `heimdall6.9capi.com`):
  root `state(address: <avatar>, accountAddress: "0x000000000000000000000000000000000000001f")` returns
  Bencodex as hex → the same 442 ids. `stateQuery.avatar(avatarAddress) { name level agentAddress }`
  confirms an address. `stateQuery.agent(address) { avatarStates { address name level } }` lists an
  account's avatars. An avatar with no state answers `null` — tell that apart from a failed request.
- **No name → address lookup anywhere.** Not on the node, not on Mimir (`avatar` takes an address; the
  rankings have `skip`/`take` and no filter), not on 9CAPI (`arenaParticipants` answers 444 without a
  key; the leaderboard was `[]`). So the address is **entered by hand**.
- **Item names:** the item sheets (`EquipmentItemSheet`, `MaterialItemSheet`, `CostumeItemSheet`,
  `ConsumableItemSheet`) have a `_name` column. Of the **424** items the collections need: **242** have
  an English name, **110** a Korean one, **72** are in no sheet. `GET https://api.9capi.com/getcraftlist`
  adds nothing. The real English texts live in the game client's localisation files, **path not found**
  (`planetarium/NineChronicles` on `raw.githubusercontent.com`; every guess was 404, and GitHub tree pages
  are blocked in the cloud sandbox). `800120`, the item most open collections need, is unnamed.
- Of the 942 collections, 716 need one item and 123 need two. The test avatar has 500 missing, 423 of
  them single-item.

## Not built yet — the work, in order

1. **A `core/data` port that reads a collection.** Mimir first (`collection(address)` — JSON, no
   decoding), the node's raw state as the fallback and cross-check (the decoder is already in
   `src/core/collection/unlockedState.ts`). It also serves the next item.
2. **Confirm the address against the network** when it is saved: `avatar(address).name` shown for the
   user to confirm. Today only the _shape_ is checked, because a feature may not reach the network.
3. **Local store for manual ticks** (a new table, `core/db`, migration) and the **reconciliation view**
   using `collectionProgress`.
4. **The bundled sheet + names**, generated by a script from Mimir's `sheet()`, with the source and the
   block index recorded beside it. Unnamed items show family and id (or the Korean name, marked).
5. **The screen** (a route parallel to the roster) with the usability ideas from the first session:
   sort by items still missing (the "one away" collections first), by bonus value, group by item
   family, an overall progress bar, an item shared by several open collections shown once with
   "unlocks N", and manual "hunting" / "ignore" marks.
6. Smaller, owed: a second device does not learn the avatar from the server (the client never calls
   `GET /v1/me/avatar`); an avatar cannot be removed, only replaced.

## Picking this up locally

```
git fetch origin ccr-447f2719-u08rgd && git checkout ccr-447f2719-u08rgd
npm install            # root
npm --prefix backend install
git checkout package-lock.json   # see below
npm run verify         # the same thing CI runs
```

- **`npm ci` fails** here (npm 10.9 vs the lockfile: it wants `@types/react@17`). `npm install` works but
  rewrites `package-lock.json`; **revert that file** before committing.
- The Node project (`.test.ts`) may not import `react-native`; `.test.tsx` runs under jest-expo. A feature
  may not import another feature, `core/db` or `core/network` — the route composes (`src/app/me.tsx`).
- **Probing the network from the cloud sandbox needs the hosts allowed** in the environment's Network
  access: `api.9capi.com`, `heimdall-rpc-1.nine-chronicles.com`, `heimdall6.9capi.com`,
  `nine-chronicles.dev`, `mimir.nine-chronicles.dev`. Locally none of this applies. `WebFetch` stays blocked
  on some of them even when `curl` works.
- **Backend gotchas:** a _response_ Zod schema may not contain a one-way `.transform` (the serializer
  encodes with it and answers 500 — the address schema is split into request and response for that
  reason). `npm run db:generate` produced a random migration name; it was renamed to
  `0002_viewer_avatar` in the file and in `_journal.json`.
- **`npm run verify` was green at `83511f0`:** 717 tests (native), 469 (Node), 46 (backend). The
  `console.error` noise from `playerForm` tests is old and not a failure.
- Commits on this branch carry **no `Co-authored-by` or Claude attribution** (the owner's preference).

## Open questions for the owner

- Merge into `claude/backend-data-management-w98hph` (which **deploys migration `0002`**), or keep it a
  separate line until the collection screen exists?
- Where do English item names come from? Options: find the client's localisation file; accept the 242 and
  show family + id for the rest; hand-curate the missing 182.
- Does the collection section get its own tab/route next to the roster, or a screen reached from `/me`?
