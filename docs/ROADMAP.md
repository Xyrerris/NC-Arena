# Arena Scout (React Native) — Roadmap

**Status:** Phases 0–4 implemented — **the demoable milestone is reached** — plus **Phase 4.5**
(the offline user-data work in ADR-0020), **Phase 4.6** (ADR-0022), **Phase 4.7** (ADR-0023 and
ADR-0024), **Phase 4.8** (ADR-0027) and **Phase 4.9** (ADR-0028, ADR-0029), all out-of-sequence
scope rather than phases that were planned. The app is no longer
read-only: players can be added, edited and removed on device, a sync no longer takes them, and the
user can say which player is _them_ and keep their own stats current.
Phase 4.7 widened the player with HP, a level and the game's own player code, and made a screenshot
of the game's profile screen fill the add-player form. Phase 4.8 gave `head_to_head` its first
writer: a swipe on a roster row records a match against that player, so the personal record and the
`MY WINS` sort are no longer columns nothing can move. Phase 4.9 made that record editable from the
detail screen, so a mis-swipe is no longer permanent. Its parser and the two ports under it live in
`core/ocr` and are tested in Node — but **the OCR itself has never run**: both packages are native,
nothing in CI builds them, and so the scan control is unproven on a device for the same reason
ADR-0017's screenshot gate is.
The Maestro screenshot gate still needs an emulator (ADR-0017), and four phases of visual
promises are now stacked behind it: Phase 1's component baselines, Phase 3's rendered roster
order, Phase 4's unclipped-at-200 % criterion, and the form screens of 4.5, 4.6 and 4.7.
**Phase 4.10 is next, and Phase 5 is gated on it** — it carries no new features, only two confirmed
defects in shipped behaviour, the durability hole ADR-0021 opened, and the housekeeping a review of
those five out-of-sequence phases turned up. Phase 5 remains gated on open decision 1 as well.
Exit criteria that are _not_ met are marked ⚠️ in each phase below rather than
quietly ticked. Open decision 5 (AA contrast) is implemented per ARCHITECTURE.md §2.4 and
still wants design sign-off (ADR-0013); open decision 8 (season) is half-answered by
ADR-0018; the delta direction and the tie rule want a product answer (ADR-0019).
**Companion doc:** [ARCHITECTURE.md](ARCHITECTURE.md) — stack, project structure, data model, open decisions.

**Supersedes** the Kotlin/Compose roadmap. The phase _shape_ is unchanged, because it was driven by
the product (design system → domain → screen → screen → backend → hardening → release) rather than
by the framework. The contents of each phase changed; the deltas are noted per phase.

---

## Assumptions behind the estimates

Stated up front because changing any of them changes the plan:

- **One React Native engineer, full time.** Estimates are working days for a single dev. Phases 1
  and 2 are independent and can run in parallel if there are two.
- **The design is final.** `design/Arena Scout.dc.html` is treated as the spec. The accessibility
  changes in ARCHITECTURE.md §2.4 are the only deviations proposed.
- **Scope is exactly two screens.** No settings, no auth, no onboarding, no match history.
- **Android ships first and alone.** React Native makes iOS reachable but nothing below is budgeted
  for it; iOS is open decision 6 in ARCHITECTURE.md §9, costed at **+6 to +8 days**, answerable as
  late as Phase 6.
- **No backend exists yet.** Phases 1–4 ran against a local seed derived from the prototype's
  14 players, so UI work was not blocked on a server. That seed has since been removed
  (ADR-0021): the app starts empty and the user types their own roster in. Phase 5 is where
  the backend assumption is paid for, and it now also owes an upload path.

If a backend _does_ exist and is stable, Phase 5 shortens and Phase 2 gets slightly longer.

---

## Phase overview

| #   | Phase                                 | Days                     | Was (Kotlin) | Blocked by                        |
| --- | ------------------------------------- | ------------------------ | ------------ | --------------------------------- |
| 0   | Foundations & decisions               | 3                        | 3            | Answers to open decisions 1, 2, 5 |
| 1   | Design system                         | 5                        | 5            | Phase 0                           |
| 2   | Domain, formatting & local data       | 4                        | 5            | Phase 0                           |
| 3   | Roster screen                         | 5                        | 5            | Phases 1, 2                       |
| 4   | Player detail + Vs You                | 5                        | 5            | Phase 3                           |
| 5   | Backend integration & offline-first   | 5                        | 6            | Open decision 1                   |
| 6   | Hardening — a11y, states, performance | 6                        | 5            | Phase 4                           |
| 7   | Release readiness                     | 3                        | 3            | Phases 5, 6                       |
|     | **Total**                             | **≈36 days (7–8 weeks)** | ≈37          |                                   |

The total barely moved, and that is the honest result rather than a disappointing one — this work
is dominated by the design, the data rules and the missing states, none of which care which
framework renders them. What moved _within_ the total:

- **−1 day in Phase 2.** Drizzle + `expo-sqlite` is less ceremony than Room + KSP + Hilt wiring,
  and there is no DI container to stand up at all.
- **−1 day in Phase 5.** `fetch` + Zod replaces Retrofit + OkHttp + serialization + a Hilt network
  module, and Zod parsing _is_ the DTO→domain mapping rather than a separate layer.
- **+1 day in Phase 6.** RN pays this back: font-scale layout survival (ARCHITECTURE.md §2.5) is
  real work, the visual gate runs on an emulator instead of the JVM (§10), and cold start needs
  measuring rather than assuming.

**A demoable app exists at the end of Phase 4** (≈ day 22) — on seed data at the time; on a
hand-entered roster since ADR-0021. That is the
natural point for a stakeholder review before the backend investment in Phase 5 — and, with EAS
Build, "demoable" means an installable internal build rather than a laptop plugged into a
projector.

---

## Phase 0 — Foundations & decisions (3 days)

Nothing here is throwaway; it is the substrate every later phase sits on.

**Deliverables**

- Expo app created with TypeScript, `strict: true` and `noUncheckedIndexedAccess`; Expo Router with
  the two routes stubbed; New Architecture confirmed enabled.
- **Expo SDK and RN version pinned, with an ADR recording which and why.** Upgrades are a
  deliberate, scheduled act from here on, not a side effect of an install.
- Folder skeleton per ARCHITECTURE.md §4, each `core/*` and `features/*` directory created and
  index-exported.
- Dependencies declared: Drizzle + `expo-sqlite`, TanStack Query, Zod, MMKV, FlashList,
  `expo-font`, `expo-splash-screen`, `react-native-safe-area-context`, Reanimated.
- ESLint + Prettier + `eslint-plugin-boundaries` configured and failing on violation; the
  `toFixed` ban rule (ARCHITECTURE.md §2.2) written and tested.
- `expo-dev-client` build running on a physical Android device.
- EAS configured: `eas.json` with development / preview / production profiles, and a development
  build produced by EAS at least once — so the CI path is proven rather than assumed.
- GitHub Actions PR workflow: typecheck, lint, boundary check, unit tests, `expo-doctor`.
- `docs/DECISIONS.md` started — one ADR per resolved open decision.

**Exit criteria**

- A clean checkout installs, typechecks, lints and boots on device.
- A deliberately-added illegal import from `features/roster` to `core/db` fails CI. (Verify the
  guardrail works; do not assume it. This matters more here than it did with Gradle, because a lint
  rule is easier to silence than a compile error.)
- **`Intl.NumberFormat('en-US').format(2418904113)` returns a correctly grouped string on a real
  Android device**, not just in Node. This is a 20-minute check that decides whether §6 needs a
  hand-rolled grouping fallback, and discovering it in Phase 2 would be worse.
- Open decisions 1, 2 and 5 from ARCHITECTURE.md §9 have written answers.

---

## Phase 1 — Design system (5 days)

Extract tokens from the prototype rather than copying hex codes into screens.

**Deliverables**

- `tokens.ts`: colour (`#07100d` backdrop, `#08120f` surface, `#0e1a16` raised, `#5fd6a2` accent,
  `#e8efec` on-surface, `#e0705f` negative), spacing scale, radii — typed `as const`, so a value
  outside the scale is a type error rather than a review comment.
- Text-alpha tokens **clamped at α ≥ 0.50** per ARCHITECTURE.md §2.4, with the sub-0.50 values kept
  as explicitly-named decorative tokens usable only for hairlines and bar tracks.
- Typography: Cinzel (display), Barlow (body/UI), JetBrains Mono (numerics), bundled in
  `assets/fonts` under their OFL licences with `licenses/` attribution, loaded via `expo-font` with
  the splash screen held until they resolve.
- `ArenaText` — the single text primitive. Every other component goes through it, so the
  `maxFontSizeMultiplier` policy (§2.5) and `fontVariant: ['tabular-nums']` for numerics are
  decided in one file instead of negotiated per screen.
- Components: `StatRow`, `CompareBar`, `SortChip` (`minHeight: 48` + `hitSlop`), `RecordBadge`,
  `ViewerCard`, `SearchField`, `SegmentedTabs`, `ScreenScaffold` (edge-to-edge + safe-area insets).
- Maestro screenshot baselines for every component via a catalogue route, at default and 200 %
  font scale.

**Exit criteria**

- A catalogue route renders every component; it ships in debug builds only.
- No raw hex and no raw numeric spacing outside `core/design-system` — enforced by an ESLint rule.
- The screenshot suite runs green in CI on the fixed emulator profile, and its wall-clock cost is
  **measured and recorded here**. If it is already slow with eight components, it will not survive
  two screens, and the merge-queue fallback in ARCHITECTURE.md §10 gets triggered now rather than
  after it starts blocking people.
- Every component readable at 200 % font scale with no clipping.

---

## Phase 2 — Domain, formatting & local data (4 days)

Runs in parallel with Phase 1 if staffing allows — they share no files.

**Deliverables**

- `core/model` types exactly as ARCHITECTURE.md §5, branded `PlayerId` and `critBp` basis points.
- `roundHalfUp` in `core/common`, integer-arithmetic based, plus the `StatFormatter` implementation
  with its three unit modes. **No `toFixed` anywhere in the module.**
- Drizzle schema: `players`, `head_to_head`, indices on `rank`, `combat_power`, `wins`; migrations
  generated by `drizzle-kit` with the SQL committed.
- ~~`assets/seed.json` — the 14 prototype players plus the viewer, as **one** ranked list~~ and
  ~~`localSeedRosterSource`~~. Both **removed in ADR-0021**; they are listed here because the
  phase genuinely delivered them and everything built on top assumed them. The one-ranked-list
  fix they carried (resolving the rank-12-in-a-14-player-roster inconsistency,
  ARCHITECTURE.md §7) outlived them: it is now an invariant of the write path itself.
- `rosterRepository` with SQL-side sort and search, exposing `useLiveQuery`-backed observers.
- MMKV preferences: `shortUnit`, last sort, viewer id.

**Exit criteria**

- Formatter unit tests pass, including: `2,418,904,113` renders exactly; a value above 2^53 is
  rejected by the safe-integer guard; rounding boundaries `9.995 B` / `99.95 B` / `100 B` produce
  the documented half-up output — **the `9.995` case is the one that proves `toFixed` was actually
  removed rather than wrapped**, since `toFixed` returns `"9.99"` there; `critBp` renders 4
  decimals with no float drift.
- Query tests run against `better-sqlite3` in Node and cover all three sorts plus case-insensitive
  search — no emulator in this phase's test loop.
- A repository test proves data survives app restart with no network.

---

## Phase 3 — Roster screen (5 days)

**Deliverables**

- `useRoster` returning the full `RosterUiState` from ARCHITECTURE.md §8 — including the Loading,
  Empty and Error states the prototype does not have.
- `RosterScreen`: viewer card, search, sort chips, `FlashList` of rows with a stable `keyExtractor`
  and a memoised row component.
- Debounced search (~250 ms) driving a SQL query, not an in-memory filter.
- Sort selection persisted in MMKV across app restarts.
- Navigation to `player/[id]`, keyed on the stable id.

**Exit criteria**

- ✅ Component tests: search narrows the list; a non-matching query shows the empty state, not a
  blank screen; each sort chip reorders correctly; state survives backgrounding and app restart.
  **The reorder assertion moved to the hook**, because `FlashList` does not re-order in the jest
  environment — ADR-0018 decision 3. The screen tests keep the chip wiring: press, selection,
  persistence.
- ⚠️ Rank badge continues to show **absolute season rank** when sorted by CP or wins. Implemented
  and asserted, so a change is now visible in a diff — but it is still inherited prototype
  behaviour and **still needs a design answer**, exactly as this line said before.
- ⚠️ Scrolling a 1 000-row roster stays jank-free on a mid-tier device, confirmed in a
  **release** build. **Not done — needs the emulator that ADR-0017 is still waiting on**, and
  now also needs a way to _get_ 1 000 rows: the seed that supplied 15 is gone (ADR-0021) and
  hand entry does not scale to a load fixture. Open decision 2 is about a roster far larger
  than anything the app can currently be filled with.

---

### What Phase 3 added beyond the deliverables

Recorded here so the next phase does not rediscover them: `ArenaDataProvider` (the repository and
its live-query runner reach screens through context, so a screen can be rendered in a test),
`observeRosterSize` / `getViewerId` / `getSeason` on the repository, and `createStubLiveData` /
`createTestRepository` in `core/testing`. Phase 4's detail screen consumes all of them unchanged —
`observePlayer` is already there and already returns `{ query, map }`.

---

## Phase 4 — Player detail + Vs You (5 days)

**Deliverables**

- `PlayerDetailScreen` with segmented Stats / Vs You tabs, tab state surviving backgrounding.
- Stats tab: 5 rows, exact value and rounded value both rendered.
- Vs You tab: head-to-head card, 5 `CompareBar` rows, per-stat delta, verdict line. Bar fill
  animated with Reanimated on the UI thread.
- Android predictive back working, and a visible back affordance that agrees with it.

**Exit criteria**

- ⚠️ Maestro screenshots prove both representations of every stat are visible and unclipped at
  200 % font scale, for the widest values the product can hold. **The flow is written**
  (`.maestro/player-detail.yaml`, registered in the harness) **and has never been run** —
  ADR-0017's emulator is still the blocker. Since ADR-0021 the flow **enters its own subject
  through the add-player form**, because a fresh install has nobody to deep-link to.
- ✅ Delta semantics documented and tested: the percentage is `(theirs − mine) / mine`, so a
  _positive_ delta means the opponent is stronger and renders in the negative colour.
  ⚠️ Tested and asserted; **still unverified against design intent** (ADR-0019). It reads
  backwards at a glance, and that has not stopped being true.
- ⚠️ Ties resolved: `mine >= theirs` still counts as a lead, so a mirror match reports "you lead
  in 5 of 5 stats". **Kept and asserted by name**, so changing it breaks a test that says why —
  but confirming it is a product call that has not been made (ADR-0019).
- ✅ Zero-match opponents render "never fought" and do not divide by zero — the never-fought
  path performs no division at all, which is stronger than testing that it survives one.
- ✅ A deep link to `player/<unknown-id>` renders a real not-found state. This needed a data
  change to be truthful: the viewer is now LEFT joined, because inner-joined "no such player"
  and "no avatar yet" were the same empty row (ADR-0019).

**Milestone: demoable app,** distributable as an EAS preview build. It demoed on seed data at
the time; a demo now starts by adding a player, which is the product. Stakeholder review
here.

---

## Phase 4.5 — Offline user data (unplanned, ADR-0020)

Not in the original plan. It is numbered 4.5 rather than folded into a neighbouring phase
because it is neither: Phase 4 was the last read-only screen, and Phase 5 is the backend. This
is the app learning to **write**, which every phase so far was able to avoid thinking about.

**Deliverables**

- `players.origin` (`REMOTE` / `LOCAL`) with a committed migration, so a synced row and a
  hand-entered one are distinguishable at the only layer that can enforce the difference.
- `PlayerDraft` and `validatePlayerDraft` in `core/model` — one rule, called by the form and by
  the repository, so a second entry point cannot store what the form would refuse.
- `createPlayer` / `updatePlayer` / `deletePlayer` on the repository, returning `Result` with
  per-field rejections.
- `replaceRoster` preserves local rows across a sync and renumbers them below the new ladder.
- `features/playerForm`: an add/edit screen at `player/new` and `player/edit/[id]`, reached from
  the roster header, the empty roster, and the detail screen of a local player.
- `ArenaButton` and `FormField` in the design system, both in the catalogue route.

**Exit criteria**

- ✅ A player added from the roster is in SQLite, at the bottom of the ladder, with ranks still
  a contiguous 1..N list. Asserted as the shape of the whole list, because a duplicate rank
  renders perfectly and would otherwise fail silently.
- ✅ A refresh does not remove a hand-entered player, and re-seats them when the ladder changes
  size. Both halves asserted, including the case where the snapshot claims their id.
- ✅ Removing a player closes the gap behind them.
- ✅ A synced player offers no edit control and the repository refuses the write regardless of
  how it is reached.
- ✅ A rejected draft names **every** offending field at once, and a field's message clears as
  that field is retyped.
- ✅ **Every row is the user's.** Resolved 2026-08-24 by removing the seed entirely (ADR-0021):
  a new install opens empty, so there is no longer a block of uneditable `REMOTE` players
  sitting above the ones the user added.
- ⚠️ **A locally added player is announced to a screen reader and not drawn on screen.** The
  design has no badge for it. This needs a design answer, exactly as the rank-badge question in
  Phase 3 does — and it is listed here rather than ticked for the same reason.
- ✅ **Crit is entered as a whole percentage, and may exceed 100 %.** Resolved 2026-08-24: the
  draft carries `critPercent`, the column keeps basis points, and the x10 000 happens once in
  `core/db/write.ts` after validation. No decimal is ever parsed, so §2.2 needed no extension —
  and a fractional entry is refused rather than rounded.
- ⚠️ No Maestro flow. Three phases of screenshot criteria now depend on ADR-0017's absent
  emulator; a fourth unrun flow would be paperwork. The form's states are asserted at 200 % font
  scale in jest, which cannot see clipping.

---

## Phase 4.6 — Who you are, and your own stats (unplanned, ADR-0022)

Numbered like 4.5 and for the same reason: it is the app learning to answer a question the
read-only design never had to. Phase 4.5 made every row writable **except one** — nobody was
the viewer, because `setViewerId` had a single caller (the sync) and there is no sync and no
seed. So the hero card, the personal record and the whole Vs You tab were degrading gracefully
around a hole rather than around a missing server.

**Deliverables**

- `setViewerId` on the repository: selects an **existing** row, refuses an id that is not one,
  and returns a `Result`.
- `useViewerId` in `core/data` — a `useSyncExternalStore` over a listener set, so a viewer
  changed on one screen re-keys the observers on another. `useRoster`, `usePlayerDetail` and
  `usePlayerForm` all read it that way.
- `PlayerFormMode.viewer`, and `/me`: the roster as a picker until an avatar is chosen, then
  the eight-field form over that player, with no create and no delete.
- One roster control with two labels — "Who are you?" and "Update my stats".

**Exit criteria**

- ✅ A fresh install can name its avatar, and the choice survives a restart.
- ✅ The chosen player's CP, ATK, DEF, crit, hit, SPD and score can be rewritten from `/me`, and
  the roster's hero card shows the new numbers.
- ✅ An id that is not a row is refused, and writes no player — choosing selects, it never
  creates.
- ✅ The viewer screen offers no remove control, and a wrong choice can be corrected in place.
- ✅ Changing the avatar re-keys the roster underneath without a remount, which is what the
  subscription is for.
- ⚠️ No Maestro flow, for the reason Phase 4.5 gives: the emulator of ADR-0017 is still absent,
  and this is now the fourth set of visual promises stacked behind it. The states are asserted
  in `ViewerScreen.test.tsx` at 200 % font scale, which cannot see clipping.

---

## Phase 4.8 — Recording a match from the roster (unplanned, ADR-0027)

Numbered like 4.5 and 4.6 for the same reason. Phase 2 built `head_to_head` and Phase 4 read it on
two screens, but nothing outside a sync had ever written a row — and there is no sync (ADR-0021).
The personal record was structurally correct and permanently zero.

**Deliverables**

- `MatchOutcome` in `core/model`, and `recordMatchResult` in `core/db/write.ts`: a read-modify-write
  inside a transaction, creating the pairing the first time the two players meet.
- `recordMatch(opponentId, outcome)` on the repository, returning a `Result`. It resolves the viewer
  itself, so no caller can name both sides of a head-to-head.
- A swipeable `RosterRow`: left records a win, right records a loss, over a pan that activates only
  on a clearly horizontal drag and commits only past a distance threshold.
- The same two acts as `accessibilityActions`, which is also what the tests drive.
- `GestureHandlerRootView` at the root layout, and the two Reanimated entry points
  `GestureDetector` needs added to the jest mock.

**Exit criteria**

- ✅ A recorded win adds one win and leaves the losses alone; a loss does the reverse. Asserted at
  the repository and again through the rendered badge.
- ✅ A player never fought gains a record rather than staying blank, and repeated swipes count
  rather than collapsing into one.
- ✅ The badge updates without a reload. That is not free: `useLiveQuery` does not re-run a query
  over `players` when `head_to_head` changes, so the observer is re-keyed on every recorded match.
- ✅ Recording re-sorts the ladder under `MY WINS`, because that sort reads the column that changed.
- ✅ Your own row offers neither action, and **no** row offers them while no avatar has been chosen.
- ✅ A refused write is reported above the ladder and does not replace it.
- ✅ **Undo — closed by Phase 4.9 below**, one phase after this one admitted the gap. The sentence
  it answers is left standing underneath, because the gap was real while it stood.
- ⚠️ **There is no undo.** A mis-swipe is a permanent increment; the only protection is the
  commit distance a short drag falls short of. Removing a recorded match is the obvious next piece
  of work and is not in this one.
- ⚠️ **The gesture itself is unproven.** No Node renderer dispatches a pan, so what jest covers is
  the accessibility path into the same handler. The drag, its thresholds and its spring-back are
  behind ADR-0017's absent emulator with everything else visual.

---

## Phase 4.9 — Editing the record, and two roster corrections (unplanned, ADR-0029)

Phase 4.8 could only ever add. This phase makes the record editable where it is read, and closes two
defects the same review found in the roster.

**Deliverables**

- A stepper in the detail screen's Vs You tab: minus, count, plus, on each of `WINS` and `LOSSES`.
- `MatchDelta` in `core/model`, and a signed `recordMatchResult` — one write for both directions,
  with `BELOW_ZERO` as its fourth refusal.
- `removeMatch` on the repository, beside `recordMatch`.
- `observePlayer` re-keyed on every step, the fix `observeRoster` already carries.
- The roster's refused-record line now clears on **any** event that is not itself a record, rather
  than on search alone.
- The roster waits for the viewer query as well as the ladder before rendering rows.

**Exit criteria**

- ✅ A step in either direction moves one column and leaves the other alone, asserted at the
  repository and again through the rendered count.
- ✅ A first match against a never-fought opponent writes a record rather than being refused.
- ✅ Neither column goes below zero: the minus is disabled at zero, and the write refuses it anyway
  with its own sentence.
- ✅ No stepper on your own page — there is no record against yourself.
- ✅ The badge follows the write with no reload, which is only true because the observer is re-keyed.
- ✅ A refused record clears on a sort, a refresh or a search, and survives a second refusal.
- ✅ No row offers a swipe before the viewer is known: rows are not rendered until both queries have
  loaded, so the affordance cannot appear a frame late.
- ⚠️ **The stepper edits a total, not a history.** Nothing stores individual matches, so "take one
  back" cannot name which. It is not undo and the UI does not call it that.
- ⚠️ No Maestro flow, for the reason every phase since 4.5 gives.

---

## Phase 4.10 — Correctness and durability before the backend (4.5 days)

Numbered like 4.5 through 4.9 for the same reason: it is unplanned scope, found by a review of the
code those five phases produced rather than by the plan. It differs from them in the one way that
decides its position — **nothing in it is a new feature.** Every item is a defect in something that
already shipped, or a hole underneath it, and each one gets harder to close after Phase 5 rather
than easier. So it runs first, and Phase 5 does not start until its exit criteria are met.

The first three are ordered by what they would cost to discover later:

1. **Unicode identity** is wrong on device _today_, for real users with real names.
2. **Records across a sync** is wrong only once a sync exists — which is Phase 5, so this is the
   last phase in which it is a change to one function rather than a data-loss incident.
3. **Export** is the answer to a question ADR-0021 opened and never closed: the roster is typed in
   by hand and lives in exactly one place.

---

### 4.10.1 — A name is one string, folded in one language (1 day)

`lower()` in SQLite folds ASCII only; `String.prototype.toLowerCase()` folds Unicode. The needle is
folded in JavaScript and the column is folded in SQL, so for any name outside ASCII the two never
meet. Reproduced against the committed migrations:

```
insertLocalPlayer(db, p1, { name: 'ÄRA' })
isNameTaken(db, 'ÄRA')                -> false   // the identical string
findPlayerByIdentity(db, 'ära', 'a1') -> null
roster search for 'ÄRA'               -> 0 rows
```

Three shipped promises are broken by one cause. The player is **invisible to the roster's own
search** (`nameMatches`, `core/db/queries.ts`); the duplicate-name guard never fires
(`isNameTaken`); and the screenshot import of ADR-0031 matches nothing, so it adds a second row for
a player plainly already on the ladder — the exact outcome that ADR was written to prevent.

Non-ASCII names are not an edge case in this product. The ladder is a game's roster, and accented
Latin, Cyrillic and Greek are ordinary there.

**Deliverables**

- ✅ `foldPlayerName` in `core/model`, and a migration (`0003_folded_player_name.sql`) adding
  `name_folded`, written by `draftColumns` for a hand-entered row and by `replaceRoster` for a
  synced one.
- ✅ `isNameTaken`, `findPlayerByIdentity` and `nameMatches` compare against `name_folded` only.
  **No `lower()` survives in the query layer**; the whole point of the column is that folding
  happens in one language, once, on the way in.
- ✅ ADR-0032 recording why the fold is a stored column rather than a collation or an expression
  index: `NOCASE` is ASCII-only too, so it moves the bug rather than fixing it, and ICU is not
  available in `expo-sqlite`.
- ✅ Node tests over the pair — the case-folding assertions belong in the fast project, because
  strings and arithmetic with no renderer is exactly what it is for.

**Two things this plan got wrong, corrected in the doing**

- **The backfill cannot live in the migration.** The plan called the fold "a pure function of a
  column that is already there", which is true — and irrelevant, because the only tool a migration
  has for computing it is `lower()`, the very function that cannot. A SQL backfill would have
  written a wrong fold into precisely the rows the column exists for. `refoldPlayerNames` does it
  in JavaScript instead, after the migrations, idempotently; the migration writes an empty default
  and nothing else (ADR-0032, decision 4).
- **The fold composes last, not first.** The plan wrote `.normalize('NFC').toLowerCase()`. Case
  folding can itself move a string between normalisation forms, so the order is
  `.toLowerCase().normalize('NFC')`.

**Exit criteria**

- ✅ The four probes all invert: `isNameTaken('ÄRA')` is true against a stored `ÄRA`, a search for
  `ära` finds it, and importing its screenshot updates the row instead of adding one.
- ✅ A name that differs only by Unicode normalisation form — `é` as one code point or as two — is
  one name to all three, asserted rather than assumed.
- ✅ A fold is not a transliteration: `Ara` and `ÄRA` stay two players. Added to the criteria
  because it is the failure a careless fix produces, and it is the one the user cannot undo.
- ✅ No executable `lower(` remains under `src/core/db` — only the comments explaining why.
- ✅ All six behavioural tests fail against the previous implementation, checked by restoring it —
  the ADR-0006 and ADR-0016 discipline applied to a defect fix rather than to a config rule.

---

### 4.10.2 — A sync may not take the user's record either (1 day)

`write.ts` states its second invariant as "a `LOCAL` row is the user's, and a sync may not take
it", and `replaceRoster` honours it for the row. It does not honour it for the record _against_
that row:

```
before: Me:LOCAL, Rival:LOCAL, 1 head_to_head row
after replaceRoster({ players: [Aurel:REMOTE], headToHead: [] }):
        Aurel:REMOTE:1, Me:LOCAL:2, Rival:LOCAL:3 — head_to_head: 0 rows
```

`tx.delete(headToHead).run()` clears the whole table, and only the snapshot's rows are written
back. The snapshot comes from a server that has never heard of a `LOCAL` player, so every match the
user swiped in against one is gone. A match record is user data by exactly the argument ADR-0020
makes about the player row; the invariant was written about half of it.

This is latent — there is no `source` (ADR-0021), so nothing calls `replaceRoster` in anger. That
is the reason it is in this phase and not in Phase 5: fixed now it is a change to one function with
a test beside it; fixed later it is the same change plus an apology.

**Deliverables**

- `replaceRoster` preserves every `head_to_head` row whose **both** ends survive the replace — read
  out alongside the `kept` players, written back after the snapshot's own records.
- A snapshot record and a preserved local record for the same pairing resolves to the snapshot's,
  under the "last-write-wins from server" policy ARCHITECTURE.md §7 already states. Written down
  rather than left to insert order.
- The rule stated in `write.ts`'s header invariant 2, which currently describes only the row.

**Exit criteria**

- The probe above ends with the local record intact and its counts unchanged.
- A record whose opponent the snapshot _claims_ — the player upstream has caught up with, whose
  local row is deliberately dropped — does not come back as an orphan pointing at a row that no
  longer exists.
- A record between two remote players is still the snapshot's to define.

---

### 4.10.3 — The roster can leave the device (2 days)

ADR-0021 removed the seed, and manual entry was confirmed as the data source (ADR-0020,
2026-08-24). Both were right, and together they left something neither says out loud: the roster
now exists in exactly one place, and that place is an app-private SQLite file on one phone. There
is no backend (open decision 1), no Android Auto Backup configuration, and no export. An uninstall,
a factory reset, a "clear data" tap or a new phone is total, silent, unrecoverable loss of
everything the user typed.

It appears in no ADR and no phase. That is what earns it a section rather than a line in a
hardening list: it is not missing polish, it is the absence of an answer to a question the last
five phases created.

The data layer is already shaped for it. `RosterSnapshot` is the serialised form — it is the type
Phase 5's sync will hand to `replaceRoster` — and `replaceRoster` is already the atomic writer that
applies one. Export is that type reaching a file; import is it coming back.

**Deliverables**

- ADR-0033 fixing the format, answering three things: that it is JSON rather than a copied `.db` (a
  schema-versioned document survives a migration, a binary written under an older schema does not),
  that it carries the schema version it was written at, and what an import does to what is already
  there — **replace, not merge**, for the same reason `replaceRoster` replaces.
- `core/data`: `exportSnapshot(): RosterSnapshot` and `importSnapshot(snapshot): Result<void>`, the
  second validating before it writes and refusing a version it does not understand with a sentence
  that names the version.
- A file written through `expo-file-system` and handed to the system share sheet; an import through
  the document picker. No new screen — a pair of controls where the app already has a settings-free
  home for them, which is `/me`.
- Round-trip tests in the Node project: export, wipe, import, and the ladder comes back identical,
  including every head-to-head and the viewer.

**Exit criteria**

- A roster exported, the app's data cleared, and the file imported produces the same ladder in the
  same order with the same records and the same viewer.
- An import refuses a truncated file, a file from a future schema version, and a file that is not
  ours, each with its own sentence — and refuses them **before** touching the database, so a bad
  file cannot leave a half-replaced roster.
- The exported file is readable by a human. It is the user's only copy of their own data, and an
  opaque one would be a worse answer than none.

---

### 4.10.4 — Housekeeping the review turned up (0.5 day)

Small and individually trivial. Listed rather than done silently because the first two are wrong in
a way a reader would believe.

**Deliverables**

- **`README.md` says "Current state: planning. No application code exists yet."** It is the first
  file anyone opens and it has been false since Phase 1. Rewrite it to what is actually shipped,
  and keep it a _state_ line rather than a changelog so it can stay true.
- **`deletePlayer` leaves `pref.viewerId` pointing at a deleted row.** The app degrades correctly —
  `/me` says "Pick another" — but the roster silently loses its hero card with nothing saying why.
  Clear the preference where the row is removed, and notify the viewer listeners, which is what
  every other viewer change already does.
- **Dependency audit, with the parked ones named.** `zod`, `@tanstack/react-query` and
  `expo-background-task` are unreferenced but are explicit Phase 5 deliverables — they stay, and the
  audit's job is to say so in writing so that the next reader does not remove them. `react-dom`,
  `expo-linking`, `expo-localization`, `expo-constants` and `expo-system-ui` have no reference and
  no phase; remove them unless one is a transitive requirement, which the audit checks rather than
  assumes. Separately: `expo-background-task` is declared as a **config plugin** in
  `app.config.ts`, so whatever it contributes to the manifest ships today for a feature that does
  not exist — establish what that is, and move the declaration to Phase 5 beside its code if it is
  anything at all.
- **A `coverageThreshold` on the `node` project**, set at the level the suite currently holds. There
  is no gate today, so the next phase can lower coverage in the layer that carries the rules and
  nothing objects.
- **The native project's `testMatch` lists only design-system `.test.tsx` files.** One written
  anywhere else under `core/` — `core/data`, `core/ocr` — would never run, and nothing would report
  that it had not. Widen it to the whole of `core/`; the extension already encodes the split the two
  projects care about.
- **One comment block in `app.config.ts` is in Italian** in an otherwise English codebase. Translate
  it — the reason it gives is a good one and deserves the same audience as the rest.

**Exit criteria**

- `npm run verify` green, with the coverage gate now part of it.
- A deliberately failing `.test.tsx` placed in `core/data` fails the run — the probe-the-rule
  discipline of ADR-0006 and ADR-0016, applied to the test configuration itself.
- Deleting the player who is the viewer leaves no preference pointing at a missing row.

---

### What this phase deliberately does not do

- **It does not close the visual gate.** ADR-0017's emulator is still absent and four phases of
  screenshot promises are still stacked behind it. That debt is real and it is larger than this
  phase; folding it in would turn a defect sweep into an infrastructure project and neither would
  land.
- **It does not add FTS5.** `LIKE '%needle%'` cannot use an index and will scan the whole table on a
  season-sized ladder — but the roster is small today, the debounce hides it, and 4.10.1 removes the
  _correctness_ reason to touch that query. It belongs with the first real ladder, beside the
  1 000-row scroll check Phase 3 already owes, not here.
- **It does not touch `features/`.** If any item above turns out to need a screen to change, the
  boundary was in the wrong place — and that is the finding, not the diff.

---

## Phase 5 — Backend integration & offline-first (5 days)

Gated on open decision 1, and now on Phase 4.10 as well: this is the phase that makes
`replaceRoster` run in anger, so the record-preservation fix in 4.10.2 has to be in before it, not
alongside it. If open decision 1 is unanswered by the start of Phase 5, this phase stalls while 6
and 7 continue — sequence accordingly.

**Deliverables**

- API contract agreed and written down first (OpenAPI or equivalent), specifying **the maximum stat
  magnitude and that stats are integers below 2^53**, per ARCHITECTURE.md §2.1. If the answer is
  that they may exceed it, they are typed as strings in the contract and this phase grows.
- `core/network`: Zod DTO schemas carrying `.int().refine(Number.isSafeInteger)`, the fetch client,
  domain mappers, and an error taxonomy.
- Remote source swapped in behind the existing repository interface — no feature-directory changes
  should be required. If any are, the boundary was wrong.
- **A push direction for `LOCAL` rows — now required, not optional.** Manual entry is confirmed
  as the data source for now (ADR-0020, 2026-08-24), so local rows are the content rather than
  something the sync works around. Today the sync only pulls and they survive by being left
  alone; that is a bootstrap, not a design. Budget the upload path, the conflict rule, and the
  `origin` transition (`LOCAL` -> `REMOTE` once the server acknowledges a row) as part of this
  phase rather than discovering them inside it.
- TanStack Query owning the sync call; success writes to SQLite; **no component reads `useQuery`
  data** (ARCHITECTURE.md §7).
- `expo-background-task` periodic refresh, pull-to-refresh, sync-failure surfacing.
- Conflict/staleness policy: last-write-wins from server, with a visible "updated N ago".

**Exit criteria**

- App functions fully offline on previously synced data.
- Airplane-mode → refresh shows a recoverable error, never a crash or a blank screen.
- A contract test asserts a stat value above `Int32.MAX` survives the full
  JSON → Zod → SQLite → domain → UI path unchanged, **and** that a value above
  `Number.MAX_SAFE_INTEGER` is rejected at parse time rather than silently rounded. These are the
  §2.1 regression guards, and the second is the one this platform actually needs.
- The `features/` diff for this phase is empty.

---

## Phase 6 — Hardening (6 days)

One day larger than the Kotlin plan. The extra day is font-scale layout and the emulator-based
visual gate, both of which were cheaper on the JVM.

**Deliverables**

- TalkBack pass: `accessibilityLabel` on the comparison bars (currently colour-only), `accessible`
  grouping on list rows so a row is one swipe stop rather than five, meaningful ordering, and
  `accessibilityRole` on the sort chips and tabs.
- Non-colour redundancy for ahead/behind (glyph or label alongside the colour).
- Font-scale pass at 100/150/200 %: every numeric row survives, and `maxFontSizeMultiplier`
  decisions are documented per component with a reason (ARCHITECTURE.md §2.5).
- Android accessibility scanner run; all findings triaged.
- Cold-start and scroll measured on a mid-tier device in a **release** build; bundle size reviewed
  and any accidental heavy import removed.
- String externalisation pass, even if shipping English-only.
- Dark-theme-only confirmed as intentional, or a light theme added.
- R8 verified against a release build of the native shell; Hermes bytecode confirmed in the bundle.

**Exit criteria**

- Cold start < 2.0 s to first meaningful paint on a mid-tier device, measured not felt. The budget
  is looser than the Kotlin plan's 1.5 s for the reasons in ARCHITECTURE.md §11 — if it is missed,
  the response is to fix the app, not to widen the number again.
- No accessibility scanner errors outstanding.
- A release build runs correctly end to end. This is where minification and any missing native
  config surface, so it must be an actual run on a device, not a successful build.

---

## Phase 7 — Release readiness (3 days)

**Deliverables**

- App icon (adaptive + themed) and splash via `expo-splash-screen`, configured in `app.config.ts`.
- Android signing via EAS credentials, Play App Signing, and a versioning scheme covering both
  `versionCode` and the runtime version used by OTA updates.
- Sentry wired with sourcemap upload in the EAS production build.
- **EAS Update channels and the OTA governance answer from open decision 10** — who publishes, to
  which channel, and the rollback procedure — written down in `docs/DECISIONS.md`.
- EAS Submit to the Play internal track; preview builds distributed to the team.
- Play listing assets, data-safety form, privacy policy.
- `README.md` build/run instructions; ADRs finalised.

**Exit criteria**

- A signed App Bundle installs from the internal track and completes the full flow.
- A deliberately-triggered JS crash appears in Sentry with a **symbolicated** stack trace pointing
  at TypeScript source. An unsymbolicated Hermes trace is unreadable, so this verifies the
  sourcemap upload rather than merely that the SDK is installed.
- An OTA update published to the preview channel reaches an installed build, and the documented
  rollback returns it. An untested rollback is not a rollback.
- Play Console reports no blocking policy or target-SDK issues. _Verify the current target-SDK
  requirement — it moves annually, and with Expo it follows the SDK version pinned in Phase 0._

---

## Prototype defects carried into the plan

Found while reading `design/Arena Scout.dc.html`. Each is real and each has an owner phase. **Items
1 and 11 changed meaning in the port**, and item 13 is new — see the notes below the table.

| #   | Issue                                                                                                     | Evidence                               | Fixed in        |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------- |
| 1   | Stat values exceed `Int32` — harmless in JS, but the 2^53 ceiling and the API contract now carry the risk | `atk 2,418,904,113` > `2,147,483,647`  | 2, guarded in 5 |
| 2   | Players identified by name, not id                                                                        | `DB.findIndex(x => x.name === p.name)` | 2               |
| 3   | Selection index taken from `DB` but applied to the sorted `ranked` array                                  | `sel = ranked[this.state.sel]`         | 3               |
| 4   | Viewer ranked 12 inside a 14-player roster; count reported as 15                                          | `ME.rank: 12`, `count: DB.length + 1`  | 2               |
| 5   | No loading, empty or error state — empty search renders blank                                             | no such branch in `renderVals()`       | 3               |
| 6   | Verdict counts exact ties as a lead                                                                       | `if (mine >= theirs) ahead++`          | 4               |
| 7   | Delta direction reads inverted (positive = opponent stronger = red)                                       | `pct >= 0 ? '#e0705f' : '#5fd6a2'`     | 4               |
| 8   | Six text-opacity tiers fail WCAG AA (2.44:1 – 3.67:1)                                                     | measured, ARCHITECTURE.md §2.4         | 1               |
| 9   | Sort chips ~30 dp tall, below the 48 dp touch minimum                                                     | `padding:8px 14px` on an 11 px font    | 1               |
| 10  | Ahead/behind conveyed by colour alone                                                                     | `c.color` is the only signal           | 6               |
| 11  | CRIT as a float risks inexact "exact" values — unavoidable in JS without scaling                          | `crit: 58.4127`                        | 2               |
| 12  | Sort and filter run in the render path                                                                    | `rows.sort(...)` inside `renderVals()` | 2/3             |
| 13  | **New:** `toFixed` used as a rounding specification                                                       | `(9.995).toFixed(2) === "9.99"`        | 2               |

Notes on what the port changed:

- **Item 1 is no longer a truncation bug**, because JS numbers hold every observed value exactly.
  It survives in the plan as a _contract_ obligation: the ceiling moved from 2^31 to 2^53, it is
  now enforced at runtime by Zod rather than by a type, and above it `JSON.parse` fails silently
  instead of loudly.
- **Item 11 got worse, not better.** Kotlin offered `BigDecimal` as an alternative; JavaScript has
  no non-float number type short of `bigint`, so the scaled-integer `critBp` decision is now the
  only defence rather than the preferred one.
- **Item 13 is new, and is inherited from the prototype's own code**, which uses `toFixed`
  throughout. It is a defect precisely because the prototype's rounding is the spec being ported,
  and reimplementing that spec with `toFixed` would reproduce a rounding error at the exact
  boundary the formatting contract is tested at.

Items 6 and 7 are behaviour questions, not clear bugs — they need a product answer before being
"fixed", and the plan treats them as such.

---

## Risks

| Risk                                                           | Impact                                                            | Mitigation                                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| No backend answer by Phase 5                                   | 5 days idle                                                       | Seed-based build means Phases 1–4 and 6 proceed regardless; the repository interface is the seam                                 |
| Real roster is far larger than 14                              | Phase 3 rework: pagination, FTS5                                  | Sorting/filtering already pushed to SQL; FlashList absorbs a lot; the 1 000-row scroll check in Phase 3 surfaces it early        |
| Design rejects the AA contrast changes                         | Rework in Phase 1                                                 | Raise it in Phase 0, before components are built                                                                                 |
| Head-to-head data has no source                                | Vs You tab is half the product and cannot ship                    | Escalate now — this is the highest-severity unknown after the backend question                                                   |
| **Visual regression gate too slow to run per-PR**              | The one test guarding the product's core promise gets skipped     | Cost is measured in Phase 1, not Phase 6; documented fallback is merge-queue/nightly, never Jest snapshots (ARCHITECTURE.md §10) |
| **Expo SDK upgrade cadence**                                   | A forced upgrade mid-project can break native deps for days       | Version pinned and ADR'd in Phase 0; `expo-doctor` in CI catches drift early; upgrades are scheduled work, not incidental        |
| **Hermes `Intl` gaps on device**                               | Grouped numbers render wrong on real phones while passing in Node | Verified on device in Phase 0; hand-rolled grouping fallback kept in the formatter                                               |
| **OTA updates ship an untested change straight to production** | Store review no longer acts as a backstop                         | Governance answer required before the first external build (open decision 10); rollback exercised in Phase 7                     |
| iOS added late                                                 | +6 to +8 days, mostly in Phases 6–7                               | Architecture stays platform-neutral; `Platform.select` confined to `core/design-system`; decision due by Phase 6                 |
| `shortUnit` becomes user-facing                                | New screen, new scope                                             | Preference already stored in MMKV; only the UI would be new                                                                      |
| Play target-SDK requirement moves                              | Blocked release                                                   | Verify in Phase 0 and again in Phase 7; with Expo it follows the pinned SDK version                                              |

---

## What is explicitly _not_ in this plan

Named so that adding them is a visible decision rather than drift: the iOS device frame from
`design/ios-frame.jsx` (prototype chrome, not product — and still not product now that the
framework is also React), **iOS as a shipping platform** (open decision 6, costed above),
authentication, match history or replays, push notifications, tablet/foldable layouts, a light
theme, web support via `react-native-web`, and comparing two arbitrary players against each other.
