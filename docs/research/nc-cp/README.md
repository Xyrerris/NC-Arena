# Nine Chronicles CP — kept aside

Research spike, 2026-09-30. **Nothing in `src/` uses this**, and it is not wired into `verify`
(`check.ts` is a manual script, not a Jest test). It exists so a later phase can pick up a working
formula instead of rediscovering it.

## What it answers

_Can a player's equipment be read from the chain, and the combat power (CP) recomputed from it?_
Yes. For one real avatar the recomputed Adventure CP is within **0.0045 %** of the game client:

| Battle type | Recomputed     | Game client    | Diff                 |
| ----------- | -------------- | -------------- | -------------------- |
| Adventure   | 33,890,020,719 | 33,888,480,295 | +1,540,424 (0.0045%) |
| World Boss  | 33,979,893,878 | 33,956,501,025 | +23,392,853 (0.07%)  |
| Arena       | 34,489,925,281 | 34,358,096,085 | +131,829,196 (0.38%) |

Only Adventure is in `fixture.ts`. World Boss and Arena overshoot slightly and the cause is
**unknown** — an untested hypothesis is that some equipped runes are not effective in those modes
(`RuneListSheet.use_place`).

## Files

| File             | Role                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| `combatPower.ts` | Pure port of `CPHelper.TotalCP` + the `CharacterStats` bits it needs            |
| `fixture.ts`     | Real inputs for one avatar (Adventure) and the CP the game showed               |
| `check.ts`       | `npx tsx docs/research/nc-cp/check.ts` — prints the breakdown, fails past 0.1 % |

## Where each input comes from

Public node, no auth: `https://heimdall-rpc-1.nine-chronicles.com/graphql` (Odin: `odin-rpc-1`).
Work on **Heimdall** (owner's instruction). A community list of live nodes is at
`https://api.9capi.com/rpc`.

| Input                                                                    | Source                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level, `characterId`, runes owned, equipped equipment, equipped costumes | `stateQuery.avatar(avatarAddress)` — `inventory.equipments { statsMap skills buffSkills equipped }`, `runes { runeId level }`                                                                                                                               |
| Equipped runes per battle type                                           | Raw state, **legacy account** `0x1000000000000000000000000000000000000000`, address `avatar.Derive("rune_slot_state_<Adventure\|Arena\|Raid\|InfiniteTower>")`, via `state(address, accountAddress)`. Bencodex list: slot index, type, locked flag, rune id |
| Unlocked collections                                                     | Raw state, account `0x…1f`, key = the avatar address. Bencodex list of ids                                                                                                                                                                                  |
| Sheets                                                                   | lib9c CSVs: `CharacterSheet`, `CostumeStatSheet`, `RuneOptionSheet`, `RuneListSheet` (`bonus_coef`), `RuneLevelBonusSheet`, `CollectionSheet`                                                                                                               |

`Address.Derive(key)` is **HMAC-SHA1 with the key string as the HMAC key and the 20 address bytes as
the message** (verified against the node's own `inventoryAddress`).

## Formula, as far as it is confirmed

```
CP = levelStats + Σ equipment + Σ costume + Σ rune.total_cp + runeLevelBonusCP + collectionCP
```

- Stat → CP: HP ×0.7, ATK/DEF ×10.5, SPD ×3, HIT ×2.3, CRI ×level×20, CDMG ×level×3.
- Equipment: stat CP × 1 / 1.15 / 1.35 for 0 / 1 / 2+ skills.
- Rune level bonus: `runeLevelBonus` from `RuneHelper.CalculateRuneLevelBonus`; each rune stat adds
  `value × bonus / 100000` of CP, and its value is scaled by `(100000 + bonus) / 100000` before it
  enters the totals.
- Collections: `Add` modifiers add straight to CP. `Percentage` modifiers of one stat are **summed**,
  then applied to `base + equipment + runes + costumes`. That percentage part was ~23.6 billion of
  ~33.9 billion for this avatar — leaving it out is what made the first attempt miss by a factor of
  four.

## Known weak points

- Sheets come from the **lib9c repo (`development`)**, not from the chain: `cachedSheet` returned
  `null` on Heimdall. If the repo and the live sheets differ, the result drifts.
- `CollectionSheet.csv` has ~480 rows; a client would need it (or its pre-summed form) shipped or
  fetched.
- Rounding follows lib9c (`GetStatAsLong` truncation) but the residuals above show it is not exact.
- Reading state needs a node that exposes GraphQL `state`; there is no name → address lookup, so an
  avatar address (`0x…`, not "Name #1023") is a required input.

## Verify later — open item

**Check against an active arena round, then decide the implementation.** Heimdall and Odin have no
active arena round at the time of writing (`arenaParticipants` → `ROUND_NOT_FOUND`, and the 9CAPI
`arenaLeaderboardOdin/Heimdall` lists are empty). During a live round:

1. Pull `https://api.9capi.com/arenaLeaderboardHeimdall` — it returns `avataraddress` and `cp` per
   participant — and run this module on a sample of those avatars. The leaderboard `cp` is the Arena
   value, so it validates the Arena path, the one that overshot by 0.38 %.
2. Find why Arena / World Boss overshoot (start with `use_place` and the rune slots).
3. Then pick the implementation that does the job best:
   - **Use the CP the leaderboard already publishes** — no formula, no sheets, arena rounds only.
   - **Recompute it here** — works off-season and per battle type, but needs raw state reads, the
     sheets, and a rerun of step 1 whenever lib9c changes.
   - **A thin backend endpoint** that does the recompute — the client stays free of sheet data
     (fits Phase 5's backend).
