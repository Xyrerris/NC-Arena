# Arena Scout (React Native) — Roadmap

**Status:** proposal, pending sign-off. No production code written yet.
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
- **No backend exists yet.** Phases 1–4 run against a local seed derived from the prototype's
  14 players, so UI work is not blocked on a server. Phase 5 is where that assumption is paid for.

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

**A demoable app exists at the end of Phase 4** (≈ day 22), running on seed data. That is the
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
- `assets/seed.json` — the 14 prototype players plus the viewer, as **one** ranked list (resolving
  the rank-12-in-a-14-player-roster inconsistency, ARCHITECTURE.md §7).
- `localSeedRosterSource` implementing the same interface the remote source will.
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

- Component tests: search narrows the list; a non-matching query shows the empty state, not a blank
  screen; each sort chip reorders correctly; state survives backgrounding and app restart.
- Rank badge continues to show **absolute season rank** when sorted by CP or wins — confirm this
  matches design intent, as it is inherited prototype behaviour rather than a stated requirement.
- Scrolling a 1 000-row seed stays jank-free on a mid-tier device, confirmed in a **release** build
  (Hermes, no dev-mode overhead), because a debug-build frame rate is not evidence. Guards against
  open decision 2 landing badly.

---

## Phase 4 — Player detail + Vs You (5 days)

**Deliverables**

- `PlayerDetailScreen` with segmented Stats / Vs You tabs, tab state surviving backgrounding.
- Stats tab: 5 rows, exact value and rounded value both rendered.
- Vs You tab: head-to-head card, 5 `CompareBar` rows, per-stat delta, verdict line. Bar fill
  animated with Reanimated on the UI thread.
- Android predictive back working, and a visible back affordance that agrees with it.

**Exit criteria**

- Maestro screenshots prove both representations of every stat are visible and unclipped at 200 %
  font scale, for the largest player in the seed.
- Delta semantics documented and tested: the percentage is `(theirs − mine) / mine`, so a
  _positive_ delta means the opponent is stronger and renders in the negative colour. This reads
  backwards at a glance and must be verified against design intent.
- Ties resolved: the prototype's verdict counts `mine >= theirs` as a lead, so an exact tie counts
  in your favour. Confirm or change — then test whichever it is.
- Zero-match opponents render "never fought" and do not divide by zero.
- A deep link to `player/<unknown-id>` renders a real not-found state rather than crashing on an
  undefined row. File-based routing makes that URL reachable in a way the Kotlin navigation graph
  did not, so it is now a test rather than a theoretical concern.

**Milestone: demoable app on seed data,** distributable as an EAS preview build. Stakeholder review
here.

---

## Phase 5 — Backend integration & offline-first (5 days)

Gated on open decision 1. If unanswered by the start of Phase 5, this phase stalls while 6 and 7
continue — sequence accordingly.

**Deliverables**

- API contract agreed and written down first (OpenAPI or equivalent), specifying **the maximum stat
  magnitude and that stats are integers below 2^53**, per ARCHITECTURE.md §2.1. If the answer is
  that they may exceed it, they are typed as strings in the contract and this phase grows.
- `core/network`: Zod DTO schemas carrying `.int().refine(Number.isSafeInteger)`, the fetch client,
  domain mappers, and an error taxonomy.
- Remote source swapped in behind the existing repository interface — no feature-directory changes
  should be required. If any are, the boundary was wrong.
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
