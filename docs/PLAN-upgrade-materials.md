# Plan — the Upgrade section: buy equipment as enhancement material

**As of 2026-10-27.** Proposed, not started. Nothing here is decided until it has an ADR.

**Goal.** List and buy equipment _as material_ for raising another piece, at the lowest NCG per
experience. Not tied to the collections. Grades 7 (Valkyrie), 8 (Transcendent) and 9 (Ultimate).

## What was measured (2026-10-27, Heimdall)

- **The node has the sheets lib9c lacks.** `state(address: TableSheet.Derive(name), accountAddress:
0x1000…0000)` on `heimdall6.9capi.com` returns Bencodex text. The address is
  `HMAC-SHA1(key = UTF-8 name, data = 0x…0003)`. `cachedSheet` answers null and is no use.
  `EquipmentItemSheet` has grade 9 for Weapon, Armor, Belt, Necklace and Ring (five ids each, base exp
  9.6 G); `EnhancementCostSheetV3` has 30 levels for each. lib9c `development` has neither the grade 9
  gear nor the raised base exp (grade 8: 1.2 G on chain, 0.8 G in lib9c); Mimir stops at grade 7. The
  level curve is identical in the 1,411 shared rows.
- **Base exp is per item, not per grade** (grade 7: 120 M or 150 M).
- **A material gives** its stored `Exp` if non-zero, else the sheet's base exp at +0, else the cost
  sheet's cumulative exp at its level (`Equipment.GetRealExp`). At most 50 materials per action. A
  listing does not show the stored `Exp`, so the figure from the level is a floor.
- **Aura and Grimoire have no listings** (routes 19, 20), so they are out.
- **The market, full read of grades 7-9 (13,076 listings):** the cheapest exp costs about **10 NCG per
  Gexp in every grade** (grade 9 10.3, grade 8 10.8, grade 7 6.7-8.9). Grade 9: 95 listings, all +0,
  99 NCG and up. Grade 8: 540, 25 leveled, +0 from 13 NCG. Grade 7: 12,441, 4,811 leveled, +0 from 1 NCG.
  The owner's targets sit at 1-3 NCG per Gexp for grades 8-9, so **3 to 10 times under today's floor**.
- **Leveled is not cheaper per exp today.** Cheapest leveled grade 7 is 8.9 NCG/G (a +3 at 5 NCG), the
  cheapest leveled grade 8 is 12.2. Their value is exp _per slot_ (see "Slot limit" below).

## The metric

- `k = expOf(listing) / baseExp(item)`, `R = price / k` (NCG per +0 equivalent), and
  `ng = price / (expOf(listing) / 1e9)` (NCG per Gexp, comparable across grades).
- Per grade, `R` is held against a **ceiling** and an **optimum**; see "Ranges".
- Ranking: `R / ceiling` ascending (the share of the budget spent), ties to the higher grade.
- Slot limit: 50 materials per action means 50 grade 7 +0 give 7.5 G and 50 grade 9 +0 give 480 G.
  Reaching grade 9 +10 (307 G) is 32 grade 9 pieces or about 40 actions of grade 7. This is why a
  higher grade may cost somewhat more per Gexp, and why the planner (phase 5) must count actions.

## Phases

**0. Sheets from the node (data, blocks the rest).**
`SheetSource` gains the node as first choice, lib9c as fallback, using the failover list the app has
(`NODE_ENDPOINTS`; Thor has no node). Decode with `core/common/bencodex.ts`. Reads `EquipmentItemSheet`
and `EnhancementCostSheetV3` (also feeds ADR-0046, which today reads the costs from lib9c only).
`parseEnhancementCosts` keeps the `exp` column; a new parser keeps each item's base exp. Failing to
reach the node falls back to lib9c and the screen says grade 9 and the raised exp are missing. New
ADR (supersedes the "costs from lib9c" part of ADR-0046). Done when: tests with rows copied from the
node's answer, and one live read on Heimdall.

**Status of phase 0 (2026-10-28, branch `feat/upgrade-materials`):** done as ADR-0047 —
`core/network/nodeSheets.ts`, `GameSheetSource`, `GameSheets.onChain`, and the exp parsers in
`core/collection/upgradeExp.ts`. Not yet done: a live read on Heimdall from the app.

**1. Pure logic (`core/collection`, next to `upgradeCost.ts`; a new `core/upgrade` module would
change the boundary rules in `eslint.config.js` for no gain).**
`expOf`, `score` (k, R, ng, band), `rankMaterials(listings, ranges)`, `rangesAt(date, config)` (the
ramp below). No I/O, no React. Test with real numbers: grade 8 +10 is 38.4 G, grade 9 +0 is 9.6 G,
the grade 7 +3 at 5 NCG has R 1.07. The two gates (`check:rules`) need no change; run them anyway.

**Status of phase 1 (2026-10-28):** done in `core/collection/upgradeRanking.ts` (`GRADE_RANGES`,
`ceilingAt`, `rangeFor`, `scoreMaterial`, `rankMaterials`). The ranking returns `offers`, and counts
`over` the ceiling, `leftOutAtZero` (for "N at +0 qualify") and `unvalued`. The ramp starts at
`RAMP_START` (2026-10-28). Grade 7 +0 at 8.33 /G is over its final ceiling of 8: only pieces under
about 0.96 NCG qualify at the end of the ramp, as asked.

**2. Reading the market.**
Candidate ids come from the sheet (grade >= 7, the five slots: 75 ids). Reuse `marketLibrary.scan`,
three ids at a time on request as `OffersView` does; filter locally. The commonest grade 7 item is
4,646 listings (5 pages, about 8 s), so the read is a progress list, not one spinner, and each id is
cached by `marketLibrary`. Grade 7 is read last and can be switched off.

**Status of phase 2 (2026-10-28):** done as a React-free queue in `core/collection/materialMarket.ts`:
`materialCandidates(base)` (grade >= 7, the five slots, highest grade first) and
`readMaterialMarket(candidates, scan, {signal, onSettled})`, three at a time. The caller passes the
scan (`market.scan` from `ArenaData`), so `features/upgrade` only wraps it in a hook (phase 3). Not
yet done: the per-grade floor (`floors` of `rankMaterials`) for a grade with no range, which the
screen computes from the listings it has read.

**3. The screen (`features/upgrade`, new feature, `src/app/upgrade.tsx`).**
List by the ranking above; filters for grade, slot and "only level > 0" (**on by default, as asked,
but see the note under Ranges**); the ceiling is editable. Each row shows R, k, NCG/G and the band.
Offers over the ceiling are counted, not listed, like ADR-0046's `dear`. Navigation: a tab beside
collection. **Boundary:** the purchase flow is in `features/collection` (`usePurchaseCheck`,
`useBatchPurchase`) and a feature may not import another. Move the flow's hooks and card to `core`
(or compose them in the route) before this phase; that move is its own commit.

**Status of phase 3 (2026-10-28):** done in `features/upgrade` (`UpgradeScreen`, `useUpgradeSheets`,
`useUpgradeMarket`, `upgradeUiState`) and `src/app/upgrade.tsx`, with an UPGRADE tab in `SectionTabs`.
The move of the purchase flow came first (ADR-0048, `core/purchase`). Reading starts on FIND MATERIAL,
grade 7 is off until switched on, "only raised" is on by default and says how many +0 pieces it hides,
and a ceiling can be typed per grade. Rows are selected with a chip and bought through the shared
`BatchSheet`, so phase 4 is already wired: the cart checks the batch limit, the balance and each
listing again before it pays. Not done: a live run against the market from the app.

**4. Buying.**
`purchaseBatch` with the batch ceiling, one at a time, stop at the first doubt, the same passphrase
per purchase. Nothing new in the policy except that the balance check must not count NCG that the
later upgrade will spend (as ADR-0046).

**5. Target planner (optional).**
Pick the piece and its target level: exp still to gain, materials needed in order of cost, number of
actions at 50 per action, NCG for the upgrade from the cost sheet, exp left over. The stored `Exp` of
the target piece comes from the inventory read, not from the level.

**Status of phase 5 (2026-10-29):** done. `core/collection/upgradePlan.ts` (`planUpgrade`: the
experience still needed, the cheapest offers that reach it, the upgrade NCG, the actions at 50 a
piece) and, in `features/upgrade`, `PlannerSheet` behind a PLAN AN UPGRADE button, which selects the
plan's pieces for the cart. The node does expose the stored `Exp` of a piece (measured 2026-10-29 on
the test avatar: a +0 grade 9 ring holds 9.6 G, a +13 belt 566 G), so the inventory read now carries
`exp`, `tradableId` and `equipped` (`HeldEquipment`); the collection's own logic still asks only for
`Holdings`. What the plan assumes and phase 6 must check on a real upgrade: that the piece reaches a
level when its stored `Exp` reaches the sheet's figure for it, and that a raised material gives its
stored `Exp` (the plan uses the floor from its level).

**6. Verify on a live arena, not in tests.**
Raise a real grade 7 or 8 piece with the bought material and compare its stored `Exp` after with the
planned one. If the stored `Exp` of a listing is higher than the floor (it will be, for upgraded
pieces), note by how much, and decide whether the market listing is the place to see it.

## Ranges

Stated per Gexp so that the grades compare; the equivalent price of a +0 piece is shown beside each.

| Grade          | Market floor now   | Opening ceiling (now)      | Target ceiling      | Target optimum      |
| -------------- | ------------------ | -------------------------- | ------------------- | ------------------- |
| 9 Ultimate     | 10.3 /G (99 NCG)   | 12 /G (about 115 NCG)      | 3 /G (about 29 NCG) | 1 /G (about 10 NCG) |
| 8 Transcendent | 10.8 /G (13 NCG)   | 11.5 /G (about 14 NCG)     | 2.5 /G (3 NCG)      | 0.8 /G (1 NCG)      |
| 7 Valkyrie     | 6.7-8.9 /G (1 NCG) | 9.5 /G (about 1.1-1.4 NCG) | 8 /G (under 1 NCG)  | 4 /G                |

- **Ramp.** The ceiling is `max(target, opening * f^m)` with `m` the months since a start date
  stored in the config, `f = 0.7`: about four months from the opening ceiling to the target. Both ends
  and `f` are constants in one file, so moving them is one line.
- **A new grade** (the game adds tiers every three to six months) enters with ceiling = 1.1 * its
  observed floor, then follows the same ramp. A grade whose sheet row is missing is not offered.
- **Do not hoard.** Buy for the upgrade planned, not for a stock: when a tier is added the older
  ones tend to get cheaper, and exp bought early at the opening ceiling is the exposure.
- **Note on "level > 0".** At the opening ceilings, no leveled piece qualifies today (the best is
  8.9 /G at grade 7, 12.2 at grade 8). The bargains are +0 pieces. Keep the filter as the owner
  asked, but make it a toggle that is easy to find, and say "N pieces at +0 qualify" when the list is
  empty because of it.

## Decisions to take before phase 3

1. Ranges and ramp: the table above or the owner's own.
2. Where the purchase flow lives after the move out of `features/collection`.
3. Whether the node, not lib9c, becomes the sheet source for everything (recommended: yes, lib9c as
   fallback).

## Not in scope

Aura and Grimoire (no market). Hammers as a source of exp (their market route is not mapped; the
cost sheet's `EquipmentMaterial` rows give their exp). Selling. A price history to make the ranges
adaptive: worth building only after phase 4, and NC-Market's baseline code is the reference for it
(read-only, do not modify).
