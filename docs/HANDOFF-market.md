# Handoff — buying the missing collection pieces, mid-flight

**As of 2026-10-15.** Branch `ccr-447f2719-u08rgd`, last commit `656943c`, pushed. It is **not merged
and has no PR**. This file is the map; the reasoning is in **ADR-0044** in DECISIONS.md (sections
"Built (2026-10-14)…" and "Next: buying the missing pieces (2026-10-15)"). The collection tracker
itself is in [HANDOFF-collection.md](HANDOFF-collection.md); read that first if you have not.

## The feature

On the collections screen, every open collection that has a piece the market sells has a
**FIND ON MARKET** button. It opens a bottom sheet with the collection's pieces as chips (with a
count of listings each) and the chosen piece's cheapest offers — price in NCG, combat point, a short
seller — read live from Planetarium's market service. **It does not buy yet.** The owner ran it on
the emulator on 2026-10-15 and said it is fine.

## What exists (all on this branch, all verified: `npm run verify` green at `656943c`)

| Commit    | What it settled                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f721b6f` | The collection sheet (lib9c) and equipment names (Mimir) are **fetched**, not bundled; items view lists missing equipment by name, level, element, skill, "helps N" |
| `cddd8e7` | Filter collections by the stats they reward (AND), and `HP +2%` instead of `(percentage)`                                                                           |
| `162401d` | A drawn accent diamond marks a piece that must carry a skill, one line per piece, with a legend                                                                     |
| `9d7c38b` | `MarketSource` port + `MarketServiceSource`: a complete scan of **one item**, with a running count                                                                  |
| `7af209e` | `core/collection/marketMatch.ts`: which listing satisfies a requirement; sub type → market route                                                                    |
| `de1d3d4` | `core/data/marketLibrary.ts`: 60 s cache, shared scans, abort when nobody waits; `ArenaData.market`                                                                 |
| `656943c` | The button, `MarketSheet`, `useMarketPieces`, `marketUiState`; and the Jest `testMatch` fix (below)                                                                 |

Where things are:

- `src/core/common/marketSource.ts` — the port: `MarketListing`, `MarketSource.scanItem`, `ScanOptions`
  (`onProgress` count, `AbortSignal`), `MarketError` (`OFFLINE` / `FAILED` / `CANCELLED`).
- `src/core/network/marketServiceSource.ts` — the implementation and `marketItemsUrl` (pure, pinned by a test).
- `src/core/collection/marketMatch.ts` — `listingMatches`, `matchingListings`, `marketRouteFor`.
- `src/core/data/marketLibrary.ts` — the cache; wired in `arenaRepository.ts` and `_layout.tsx`.
- `src/features/collection/` — `MarketSheet.tsx`, `useMarketPieces.ts`, `marketUiState.ts`, the row button
  in `CollectionRow.tsx`, the sheet state in `CollectionScreen.tsx`, `SkillMark.tsx`.

## Verified facts about the market (2026-10-15, Heimdall)

- **Route:** `GET https://b.9capi.com/marketProvider{Odin|Heimdall}/Market/products/items/{itemSubType}?limit=1000&offset=N&order=cp_desc&itemIds={id}`.
  The **sub type is the path and the item id is the filter** (Weapon 6, Armor 7, Belt 8, Necklace 9,
  Ring 10). An item id in the path answers 200 with nothing — an earlier session read that as "9CAPI is
  down". It was the wrong route. `api.9capi.com` is not the host to use; `b.9capi.com` is.
- **Traps (from NC-Market's README, re-checked):** `itemIds` is repeated once per value; `itemIds[]=1`
  is ignored with a 200 (the whole sub type); `totalCount` is always 0; ordering by `price` shuffles ties
  and pages overlap (use `cp_desc` and de-duplicate by `productId`); `stat` filters nothing; pages of
  5,000 time out. `MarketServiceSource` fails if the answer holds another item.
- **Cost of a scan:** 84 listings = 1 page ≈ 1.6 s; 1,358 = 2 pages ≈ 3 s; 4,646 (the commonest weapon,
  `10110000`) = 5 pages ≈ 8 s.
- **Level and skill are not filters**; they are decided locally: skill = `skillModels` not empty (lib9c's
  `SkillContains`). Of the 4,646 Long Swords, 394 have a skill.
- **Aura (sub type 19) and Grimoire (20) have no listings at all.** Costumes (sub type 1) and equipment
  materials (11) do have some; 2–5, 12 and 14 answered empty at `limit=1`; the response also has a
  `fungibleAssetValueProducts` field that nothing has looked at yet.
- **Mimir's `products` was measured and rejected:** no filter by item id, a page of 100 failed with a
  deserialization error more than half the time, and a full read took minutes.
- **There is no lookup of one listing by product** (`/Market/product/{id}` is a 404;
  `/Market/products/{id}` is a 200 with nothing in it). To re-read an offer you scan its item and pick
  the `productId` out. A purchase must do that.
- **Thor has no market** in the planet registry; it answers `FAILED`.
- Of the sheet's 1,381 requirement slots: **704** have a route, **152** are `not-sold`, **525** are
  `unknown` (costumes, materials, consumables — the catalog only holds equipment). _Before point 1
  was built; costumes, titles, food and the materials above now have a route._

## NC-Market — reference only, **do not modify it**

`D:\Documenti\Progetti\Personali\NC-Market` is the owner's C# project (a Telegram bot that reads the same
market, values pieces and can buy). **The owner said not to touch it**, and it has ~37 uncommitted files
of its own (the purchase feature, from 2026-10-02): read-only. Useful there:

- `README.md` ("Fonte dati", "Cercare e comprare dal bot") — every trap above, measured.
- `src/NCMarket.Core/PurchaseAction.cs` — the `buy_product3` action in Bencodex, verified against lib9c's
  real `BuyProduct` by round-trip.
- `src/NCMarket.Core/ChainPurchaseExecutor.cs`, `HeadlessClient.cs` — the signing flow (below).
- `PurchaseService.cs` — re-read the offer on every press, price in the confirm button, one purchase per
  offer, caps, `dry-run` default.
- `BACKLOG.md` P5 — the measured facts behind all of it.

## Decisions already made

- **Fetch, not bundle** the lib9c sheet (GPL-3.0). Fetching at run time is not shipping a copy, but it
  does not settle the licence question for a bundled one.
- **A scan is of one item, complete, with a count** — never a partial list, never a bar.
- **Only 5xx and 429 are retried**; `OFFLINE` is left to the person's retry.
- **No dimming scrim** behind the sheet: the design system has no overlay colour and a raw one is not
  allowed outside it.
- **Prices are what is asked**, and the sheet says so every time it shows them.
- **Commits carry no `Co-authored-by` or Claude attribution** (the owner's preference); **push after each
  completed step** (memory); the branch rule of CLAUDE.md is lifted, but a push to
  `claude/backend-data-management-w98hph` **deploys the backend** — do not push there.

## What is open, in the order I recommend

### 1. Costumes and materials in the same list (the owner's "point 3") — DONE 2026-10-15, not yet seen on a device

Built on this branch: `core/collection/otherItems.ts`, route table for costume (1), title (18), food (0),
equipment material (11), hourglass (15), AP stone (16); `MarketListing` carries `quantity` and `unitPrice`;
lots are shown "5 NCG each · 4 for 20 NCG"; a counted piece says "needs N". Details and what is still open:
ADR-0044, "Built (2026-10-15): costumes and materials". **The owner has not run it on the emulator yet.**
The text below is the plan it followed, kept for the reasoning.

Why first: it decides the shape of `MarketListing` and of the purchase target. Today a listing is
equipment-shaped; a material is a **fungible** product with a quantity, and a collection asks for a
`count` of it (e.g. 5 of item `201000`). Designing the purchase for equipment and widening it later is
rework.

Facts and starting points:

- 525 of 1,381 slots are `unknown` today. Their names are in `CostumeItemSheet`, `MaterialItemSheet` and
  `ConsumableItemSheet` (Mimir serves them like the equipment sheet, `_name` column, no element or level).
  About 70 of the 424 items have no name in any sheet (ADR-0044, "Where item names are"): family and id
  remain the fallback.
- Probe first, as for equipment: which routes answer for a costume (sub type 1) and a material (11), what
  `fungibleAssetValueProducts` holds, whether a material's listing carries `quantity` and a unit price.
  Do it against the live service before writing code (a blank `level` in the real sheet broke the parser
  once because only an invented fixture had been tested).
- Then: a catalog per sheet; a `kind` on `MarketPiece` and on the missing-piece entry; for materials the
  units needed (`count`) rather than "collections helped"; drop "N slots cannot be searched yet".

### 2. Buying — the owner's proposal is a passphrase typed at every purchase, never saved

My assessment: **sound, and I would build it, in steps, after point 1.** Nothing below is built.

What it means concretely: Nine Chronicles keys live in a **keystore** (Web3 Secret Storage, a JSON
file whose private key is encrypted with the passphrase). The app would keep the encrypted keystore, ask
for the passphrase at each purchase, decrypt in memory, sign, and drop both. The passphrase and the
decrypted key are never written anywhere.

What NC-Market does today (read from its code, 2026-10-15): the key is a raw hex string in an
environment variable of a server bot. A phone app cannot do that; the keystore + passphrase fits a phone.

The flow it would follow (NC-Market's, which is already verified except the real send):

1. Read the balance; build `buy_product3` in Bencodex (`PurchaseAction.cs`).
2. Ask a **node** for the next nonce and for the **unsigned transaction**
   (`nextTxNonce`, `unsignedTransaction`) — no public node exposes a builder for this action.
3. **Verify what the node returned before signing**: action, public key, signer, nonce, genesis hash, gas
   must be exactly what was asked. Without this a node could swap in a transfer and the key would sign
   it. This check is the one thing everything rests on.
4. Sign (ECDSA secp256k1 over the unsigned bytes), `signTransaction`, then `stageTransaction`. The
   transaction id is the SHA-256 of the signed bytes, known before sending.
5. Poll `transactionResult` for the outcome; it arrives later, the app must not stand still.

What a phone app needs that is **not in this repo yet** (`package.json` has no crypto, no Bencodex
encoder, no secure storage; only a Bencodex _decoder_ in `core/collection/unlockedState.ts`):

- A secp256k1 signer and SHA-256 (`@noble/curves`, `@noble/hashes` are the obvious candidates), a
  keystore decrypter (the KDF and cipher must be read from a real keystore file — Libplanet's default is
  PBKDF2 + AES-CTR, to be confirmed, and **measured on Hermes**: a slow KDF in JS is a UX and battery
  question), a Bencodex encoder, and `expo-secure-store` for the encrypted keystore.
- Whether the signature format the node wants (DER, low-S, over SHA-256 of the payload) is what the JS
  library produces. NC-Market uses Libplanet's `Key.Sign`; its tests intercepted staging, so the format
  was never confirmed against a real send. **Confirm before anything real.**

Safety rules to keep from NC-Market and add:

- The keystore's address must equal the **agent address of the viewer's avatar** (the app already reads
  it from the chain: `AvatarSource` returns `agentAddress`). Refuse otherwise.
- **Re-read the offer at every press** (scan the item, find the `productId`); the confirm button carries
  the price; if the price moved, buy nothing and show the new card.
- One purchase per offer; a record **before** the send; a per-purchase cap; `dry-run` as the default mode
  (everything up to the signature, nothing signed or sent).
- The **chain is the final arbiter**: a sold or withdrawn listing fails on chain.
- The account needs **Mead for gas** besides NCG. The app can read NCG; the Mead the chain will say.
- Use an account made for it with a small budget, never the main one. The first real send is the owner's,
  with a few NCG.
- The passphrase protects the key **at rest**. It does not protect against a compromised phone or a
  malicious build that reads the field; say so honestly in the ADR and the UI.

Suggested steps (each shippable, none spends):

- **A. (DONE 2026-10-15, not yet seen on a device.)** Tapping a listing in the sheet opens a card
  (`PurchaseCard`, `usePurchaseCheck`, `purchaseCardState`): the offer re-read with a **fresh** scan
  (`MarketLibrary.scan(…, { fresh: true })`), its price, the account's NCG from the node
  (`BalanceSource` / `NodeBalanceSource`: top-level `goldBalance(address)`, **not** under `stateQuery`),
  what the buy would leave or how much is short, and "Buying is not available yet". An unreadable balance
  is shown as unknown, never zero; a listing that is gone is its own state. No button buys: nothing is
  signed. The account comes from the viewer avatar's `agentAddress` (`AvatarSource`). Still to do for
  the real thing: the price-moved check (a price change is a new `productId`, so today it reads as "gone"),
  the mid-air `productId` race, and everything in B–D. Original description:
  The confirmation card, no key: pick a listing in the sheet → re-read it → show piece, price,
  seller, balance, "this would buy". Nothing is signed. (Needs a way to read the balance: node GraphQL.)
- **B. (DONE 2026-10-16, not yet seen on a device.)** On `/me`, a "Wallet keystore" block
  (`features/keystore`): paste the keystore JSON, it is stored as text under the MMKV key `pref.keystore`
  (`ArenaData.keystore`); type the passphrase, **test** it; the answer is whether it opens, the address of the key
  inside (`core/common/keystore.ts`: PBKDF2 or scrypt, AES-128-CTR, Keccak-256 MAC, secp256k1 → address) and
  whether that is the **agent address of the viewer's avatar** (`AvatarSource`). The key is cleared the moment
  the address is read; the passphrase is an argument and the field is emptied on use. **Checked against the
  Web3 Secret Storage spec's own vectors** (both the PBKDF2 and the scrypt one decrypt to the known key and
  address). Decisions and gaps, all worth the owner's eye:
  - **Paste, not a file picker, and MMKV, not `expo-secure-store`.** Both would add a native module (a dev-client
    rebuild); the new packages are pure JS (`@noble/ciphers`, `curves`, `hashes`, exact 2.4.0, ESM-only, so
    `jest.config.js` now transforms `@noble` in both projects). A file picker and secure storage are the
    upgrade if pasting a long JSON is too clumsy on a phone.
  - **`android:allowBackup="true"`** is set in the merged manifest, so the stored keystore (passphrase-locked)
    could ride along in a Google backup. A weak passphrase plus a copied file is an offline brute force.
    Not changed here; `allowBackup=false` or excluding the MMKV file is the fix, and a decision for the owner.
  - **Not measured on Hermes.** PBKDF2 at Libplanet's default (10,240 rounds) is a fraction of a second on Node;
    on a phone nobody has timed it. scrypt over 64 MiB (the spec default is 256 MiB) is refused as
    `UNSUPPORTED`, not attempted.
  - **Libplanet's own file was not available to check.** The format is the public spec's, which Libplanet
    follows (`Web3KeyStore`); a real keystore of the owner's is the first thing to try.
    Original description: Keystore import and decrypt test: store the encrypted file, ask for the passphrase, prove the
    address matches the avatar's agent, drop the key. No purchase.
- **C. (DONE 2026-10-16.)** `dryRunPurchase` (`core/common/purchaseDryRun.ts`) builds `buy_product3`
  (`transaction.ts`, over a new Bencodex codec `bencodex.ts`), asks the node for the nonce and the unsigned
  transaction (`NodeTransactionSource`, the `TransactionSource` port — **which has no method that sends**),
  checks it field by field, signs (ECDSA/SHA-256/DER/low-S, noble), verifies the signature against the key,
  has the node attach it (`signTransaction`), checks the signed bytes are the unsigned ones plus `S`, and stops
  with the id the transaction would have. **Run live on Heimdall with a freshly generated key holding nothing**
  (a throwaway test, deleted): nonce 0, a 527-byte unsigned transaction that passed every check including the
  planet's genesis hash, a 604-byte signed one, and the signature verified by **Node's own `crypto`**, an
  implementation independent of the one that made it. `stageTransaction` was never called and does not exist
  in the code that ran. What this does **not** prove, because the node has no validate call and the only test
  is a send: that the chain _accepts_ this signature and this action layout. The action's layout follows
  NC-Market's `PurchaseAction.cs`, which checks it against lib9c's own `BuyProduct`; this repo checks it
  against that description. Still open for D:
  - `MarketListing` lacks `sellerAgentAddress`, `tradableId` and `legacy`, which the action needs; the
    market service sends them. `PurchaseOffer` is the type that will be built from a re-read listing.
  - Equipment only (the five `ItemSubType` names). Costumes and fungible items (materials) are not verified.
  - Randomness: `secp256k1.utils.randomSecretKey()` needs `crypto.getRandomValues`, which Hermes does not
    provide without a polyfill; the action id needs it too. Not needed to _sign_ with an imported key.
  - The price-moved check, the per-purchase cap, the record before the send, `dry-run` as the default mode.
    Original description: `dry-run` end to end against the real node with a **throwaway key**: nonce, unsigned
    transaction, the verification, signature, `signTransaction` — and **not** `stageTransaction`.
- **D.** The first real purchase, by the owner, on a cheap piece, with the cap low.

Alternatives I considered and did not pick: hand the purchase to the NC-Market Telegram bot (no key on
the phone, but it ties the app to a bot the owner runs); a wallet-signing protocol (none with a known
mobile protocol was found — NC-Market's notes say the same); a PIN or biometrics instead of the
passphrase (not what the owner asked for).

### 3. Smaller items

- A market for **Thor**: not in the registry; nothing to do until it is.
- The sheet's "read N ago" does not tick while open (it lives seconds).
- Persist the downloaded sheets for a cold start **offline** (ADR-0044, "Known gaps").
- Sorting collections by bonus (a percentage cannot be ranked against a flat amount).
- The "hunting" / "ignore" marks have nowhere to be stored.

## Picking this up locally

```
git fetch origin ccr-447f2719-u08rgd && git checkout ccr-447f2719-u08rgd
npm install
npm --prefix backend install
git checkout package-lock.json   # npm ci fails here; see HANDOFF-collection.md
npm run verify                   # typecheck, lint, 3 gates, Prettier, both Jest projects, backend
```

At `656943c`: 891 tests (all Jest projects), 609 (Node coverage run), 46 (backend).

## Things that will trip you up

- **The Jest `node` project now matches `.test.ts` in `core`, `features` and `app`.** It matched `core`
  alone before, so `.test.ts` files under `features/` **never ran** — one carried a stale expectation
  unseen. `scripts/check-test-projects.mjs` has a probe for each folder, mutation-checked. If you add a
  `.test.ts` in another folder, check it actually runs.
- **A stray worktree breaks `verify`.** A `.claude/worktrees/<name>/` directory (made by the Claude app,
  git-ignored) is scanned by ESLint, Prettier and Jest: lint errors from its files and a second copy of
  React that fails `RosterScreen.test.tsx`. It was gone on 2026-10-15 afternoon. If `verify` fails with
  paths under `.claude/worktrees`, that is the cause, not your change; excluding `.claude` from the three
  tools is a config change that needs its own probe (CLAUDE.md).
- **Lint rule `react-hooks/purity`** forbids `Date.now()` in render; read the clock in `useState(() => …)`.
- **No `toFixed`** in `core/common` (ARCHITECTURE.md §2.2); prices are formatted in whole hundredths
  (`formatNcg`).
- **Raw colours, spacing and radii are rejected outside `core/design-system`** (`check:tokens`); there is
  no overlay colour.
- **The environment:** a GateGuard hook asks for "facts" before the first Bash command and before the first
  edit or creation of each file in a session (callers, affected API, data, the user's instruction), then
  lets the retry through. No Python on this Windows machine (use `node`). Run `npx prettier --write` before
  `verify`. Live checks against the real services were done with a throwaway `*.test.ts` under `src/`,
  run with Jest and deleted — never committed.
- **`.gitignore` shows as modified** in `git status`; that is the owner's uncommitted work (screenshots
  from `docs/ArenaScoutResults`), not part of this feature. Stage files by name.
- jest-expo renders at **font scale 2**, so every component test is also a 200 % render — but nothing
  here has been seen at 200 % on a device.

## Open questions for the owner

- Costumes and materials are built (2026-10-15). Next: check them on a device, then the purchase
  confirmation card (step A)?
- Is a keystore **file** the right thing for the owner to import (does the owner have one, and where),
  or would a raw private key pasted once be expected? The passphrase proposal assumes a keystore.
- Which node endpoints may the app use for the nonce and transactions: the planet registry's public ones
  (`heimdall-rpc-1.nine-chronicles.com`, `heimdall6.9capi.com`)? They answered in the 2026-10-01 probes.
- Merge into `claude/backend-data-management-w98hph` (which deploys the backend) or keep a separate line?
  Nothing in this feature touches `backend/`.
