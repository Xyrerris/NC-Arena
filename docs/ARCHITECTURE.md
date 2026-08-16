# Arena Scout — React Native Infrastructure Proposal

**Status:** proposal, pending sign-off. No production code written yet.
**Source of truth for UI:** `design/Arena Scout.dc.html` (Claude Design prototype, imported 2026-08-13).
**Companion doc:** [ROADMAP.md](ROADMAP.md).

**Supersedes** the Kotlin/Compose proposal. Everything below is the React Native equivalent; the
product decisions (§2, §5, §6) survived the platform change almost unchanged, the platform
decisions (§3, §4, §10, §11) did not.

---

## 1. What the prototype actually specifies

Unchanged by the platform decision. The prototype is a two-screen app; everything outside those
two screens in the imported files is scaffolding and must **not** be ported.

| Screen                         | Contents                                                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Roster** (`isList`)          | Title "Arena" + season label, registered-player count, "your avatar" hero card (name, CP, rank, score, record), search field, 3 sort chips (Rank / CP / My wins), scrolling list of player rows (rank badge, name, exact CP, W·L record, score) |
| **Player detail** (`isDetail`) | Back affordance, rank, name, CP exact + short, segmented control with two tabs                                                                                                                                                                  |
| → **Stats** tab (`isStats`)    | 5 rows — ATK, DEF, CRIT, HIT, SPD — each showing the **exact** value (mono, small) and the **rounded** value (large)                                                                                                                            |
| → **Vs You** tab (`isVs`)      | Head-to-head card (record + note), 5 comparison rows with paired YOU/THEM bars, % delta, both exact values, and a verdict line                                                                                                                  |

**Not part of the app.** `design/ios-frame.jsx` is a prototype device frame — iOS status bar,
dynamic island, home indicator, liquid-glass nav pills, on-screen keyboard. It exists only to
photograph the design in a phone shell. None of it gets reimplemented, and that stays true now
that the target framework is also React: the file is Claude Design prototype chrome, not a
component library. `design/support.js` is the generated Claude Design runtime (a React interpreter
for the `<x-dc>` template dialect) and is likewise not a dependency.

The equivalents of that frame are the platform's own: edge-to-edge content with
`react-native-safe-area-context`, the system status/navigation bars, and Android predictive back.

---

## 2. Constraints the data imposes (verified, not assumed)

These drive real decisions, so they were checked against the prototype's seed data rather than
eyeballed. **This section changed most in the port** — the risks did not disappear, they moved.

### 2.1 Stat values overflow 32-bit integers — but not JavaScript numbers

```
Int32 max               : 2,147,483,647
Number.MAX_SAFE_INTEGER : 9,007,199,254,740,991   (2^53 - 1)
max atk                 : 2,418,904,113   -> overflows Int32, safe in JS
max hit                 : 2,210,884,019   -> overflows Int32, safe in JS
atk over Int32          : 2 of 14 players
hit over Int32          : 1 of 14 players
```

The Kotlin proposal's single most likely shipped-and-wrong bug — `Int` silently truncating
`2,418,904,113` — **does not exist in JavaScript.** Every observed value is an exact IEEE-754
double. Stats are plain `number`.

That is not the end of the problem, only its relocation. Three things replace it:

- **The ceiling is 2^53, not 2^63.** Above `Number.MAX_SAFE_INTEGER`, `JSON.parse` loses precision
  _silently and irreversibly_ — verified: `JSON.parse('{"v":9007199254740993}').v` yields
  `9007199254740992`. The API contract must state a maximum stat magnitude. Today's data has ~22
  bits of headroom; a future stat-inflation patch in the game does not.
- **The runtime guard is `Number.isSafeInteger`, not the type system.** TypeScript's `number`
  cannot express "integral and below 2^53", so the check has to be executable. The Zod schema for
  every stat field carries `.int().refine(Number.isSafeInteger)` — the boundary where a bad server
  value is rejected loudly instead of rendering as a plausible wrong number.
- **The escape hatch is documented up front:** if the contract ever needs values above 2^53, they
  transport as JSON **strings** and the domain switches to `bigint`. Deciding this later means
  touching every layer; deciding it now costs one sentence in the API contract.

SQLite `INTEGER` is 64-bit and stores these fine; the precision loss would occur on the way back
into JS, which the same 2^53 rule covers.

### 2.2 "Exact" values must not round-trip through binary floating point

The design's own footer promises _"exact value left · rounded value right"_. CRIT is a
four-decimal percentage (`58.4127`). **In JavaScript there is no `Double`-vs-`BigDecimal` choice
to make — every number is a double**, so this constraint is stricter here than it was in Kotlin,
not looser.

**Decision:** CRIT is stored as scaled integer basis points — `critBp: number`, percent × 10 000
(`58.4127%` → `584127`). Display divides at the formatting boundary and nowhere else.

**Decision:** `toFixed` is banned in the formatting layer. It is not a rounding specification —
verified in V8, and Hermes inherits the same IEEE-754 behaviour:

```
(9.995).toFixed(2)   -> "9.99"    expected half-up "10.00"
(1.005).toFixed(2)   -> "1.00"    expected half-up "1.01"
(99.95).toFixed(1)   -> "100.0"   correct here, by luck of representation
```

The first line is exactly the `9.995 B` boundary the formatting contract in §6 is tested at, so
this is not a theoretical objection. Rounding goes through a half-up helper implemented in integer
arithmetic, unit-tested at every documented boundary. No `decimal.js` — the surface is four
functions, and a dependency here buys less than the tests do.

### 2.3 Wins/losses are a _relationship_, not a player attribute

Unchanged. In the prototype, `p.wins` / `p.losses` are read as **your** record against that player —
`h2hNote` renders `'you won ' + p.wins + ' of ' + (p.wins + p.losses) + ' matches'`. Modelling them
as columns on `Player` will break the moment the app supports more than one viewer, or compares two
arbitrary players.

**Decision:** a separate `HeadToHead` table keyed by `(viewerId, opponentId)`.

### 2.4 Several design-token opacities fail WCAG AA

Unchanged — the measurements are of the design, not of the framework. Contrast of
`rgba(232,239,236,α)` on the `#08120f` surface:

| α used in design                         | Ratio      | AA (4.5:1) |
| ---------------------------------------- | ---------- | ---------- |
| 0.30 (footnotes, exact values in Vs You) | 2.44:1     | ✗          |
| 0.34 (row score)                         | 2.81:1     | ✗          |
| 0.35 (rank label, bar labels)            | 2.90:1     | ✗          |
| 0.38                                     | 3.21:1     | ✗          |
| 0.40 (player count, CP label)            | 3.43:1     | ✗          |
| 0.42 (row CP, stat labels)               | 3.67:1     | ✗          |
| **0.50**                                 | **4.72:1** | ✓          |
| 0.55                                     | 5.48:1     | ✓          |
| 0.60                                     | 6.33:1     | ✓          |

**Decision:** the design system exposes a floor. Any token intended for text clamps at α ≥ 0.50;
below that is decorative only (hairlines, bar tracks). This changes the visual result slightly
versus the prototype and needs design sign-off — see [ROADMAP.md](ROADMAP.md) open decisions.

Two further accessibility items from the same pass: the sort chips are ~30 dp tall (below the
48 dp touch minimum — `minHeight: 48` plus `hitSlop` in RN), and the Vs You comparison encodes
"ahead/behind" by colour alone.

### 2.5 New: text scaling is opt-out in React Native

Not a data constraint, but it belongs at the same level of severity. RN `<Text>` scales with the
OS font setting by default, and the product's core promise is a long number rendered in full. At
200 % scale a 13-character exact value will wrap or clip unless every numeric row is built for it.
`maxFontSizeMultiplier` is a per-component decision that must be made deliberately and documented,
not discovered in QA — capping it is an accessibility regression, so the default is _no cap_ and a
layout that survives.

---

## 3. Proposed stack

| Concern          | Choice                                                                               | Why                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | **React Native, New Architecture (Fabric + TurboModules), Hermes**                   | Default in current RN; several picks below require it                                                                                                                                                            |
| Toolchain        | **Expo** (managed workflow + `expo-dev-client`, native dirs generated by `prebuild`) | The recommended RN entry point; gives EAS Build/Update/Submit and config plugins. Generated native dirs mean dropping to bare later is not a rewrite                                                             |
| SDK / RN version | Current Expo SDK at project start                                                    | _Pin in Phase 0 and record it in an ADR. An Expo SDK is a coordinated RN + libraries release; mixing versions across it is the most common source of unexplained native build failures_                          |
| Language         | TypeScript, `strict: true`, `noUncheckedIndexedAccess`                               |                                                                                                                                                                                                                  |
| Navigation       | **Expo Router** (file-based, typed routes)                                           | Two routes — `index` and `player/[id]`. Sits on React Navigation native-stack, so deep links and Android predictive back come from the platform                                                                  |
| Lists            | **FlashList**                                                                        | The roster is the one perf-sensitive surface; see the 1 000-row check in the roadmap                                                                                                                             |
| Styling          | **`StyleSheet` + a typed token module**, no styling framework                        | The design is bespoke, dark-only, and two screens. NativeWind/Tamagui/Unistyles each pay a setup and build-integration cost for theming and variants this app does not need. Revisit if a light theme lands (§9) |
| Local store      | **SQLite (`expo-sqlite`) + Drizzle ORM**                                             | Single source of truth. `drizzle-orm/expo-sqlite`'s `useLiveQuery` gives the reactive-query behaviour Room's `Flow` DAOs provided; `drizzle-kit` gives versioned migrations                                      |
| Sort/filter      | **SQL**, via the Drizzle query builder                                               | Not in the render path — see §7                                                                                                                                                                                  |
| Server state     | **TanStack Query** for the _fetch and sync_, never as the UI's data source           | Query owns retry, backoff and in-flight state for the network call; SQLite owns what the UI reads                                                                                                                |
| Preferences      | **`react-native-mmkv`**                                                              | `shortUnit`, active sort, viewer identity. Synchronous reads, so there is no flash of unsorted content on cold start                                                                                             |
| Validation       | **Zod** at the network boundary                                                      | Carries the §2.1 safe-integer refinement; DTO → domain mapping is the parse step                                                                                                                                 |
| Network          | `fetch` + Zod                                                                        | _Provisional — see §9 open decisions._ No Axios; RN's `fetch` covers this app                                                                                                                                    |
| Background sync  | **`expo-background-task`**                                                           | Periodic roster refresh (WorkManager on Android, BGTaskScheduler on iOS). Best-effort and OS-throttled by design — never the only refresh path                                                                   |
| Fonts            | **`expo-font`** + `expo-splash-screen`                                               | Cinzel / Barlow / JetBrains Mono bundled, loaded before first paint                                                                                                                                              |
| Animation        | **Reanimated**                                                                       | Only the Vs You comparison bars need it; not a general-purpose reach                                                                                                                                             |
| Crash/analytics  | **Sentry** (`@sentry/react-native`) behind an in-house `Analytics` interface         | Sourcemap upload integrates with EAS, and JS stack traces are what actually needs symbolicating here. The interface keeps the vendor swappable and keeps feature code free of it                                 |

**Deliberately excluded for now:** Redux/Zustand/Jotai (there is no cross-screen client state that
SQLite and route params do not already hold), a styling framework, `react-native-firebase` (a
native dependency for analytics this product has not specified), an image library (the design has
zero avatars or remote imagery), pagination, and feature flags. Pagination is the one most likely
to become necessary — see §9.

**Why Expo rather than the RN CLI.** The costed difference lands in Phases 0 and 7: EAS Build
removes the Xcode/Android-SDK CI setup, EAS Submit removes the store-upload plumbing, and EAS
Update makes a JS-only hotfix a minutes-long operation instead of a store review. The cost is a
dependency on a build service and an SDK upgrade cadence set by someone else. For a two-screen app
with one engineer that trade is plainly right; a large native-module surface would change the
answer.

**Platform target.** React Native makes iOS reachable, and the roadmap's estimates still assume
**Android ships first and alone**. iOS is a scoped, costed option, not an assumption — see §9.6.

---

## 4. Project structure

A single Expo app with enforced internal boundaries, not a monorepo. The Gradle module graph
existed to buy incremental-build speed _and_ a compile-time boundary; Metro has no equivalent
per-module cache to win, so a workspace here would cost tooling complexity and return only the
boundary — which ESLint enforces directly.

```
src/
  app/                      Expo Router routes — thin. Screens live in features/
    _layout.tsx             Providers: theme, QueryClient, SQLite + migrations, fonts
    index.tsx               -> features/roster
    player/[id].tsx         -> features/player
    +not-found.tsx          Unmatched deep links

  core/model/               Pure TS. Player, PlayerId, StatKey, HeadToHead, RosterSort.
                            No React, no SQLite, no fetch — testable in plain Node.
  core/common/              statFormatter, half-up rounding, Result type.
  core/design-system/       tokens (colour/type/spacing/radii), ArenaText, StatRow,
                            CompareBar, SortChip, RecordBadge, ScreenScaffold.
  core/db/                  Drizzle schema, migrations, queries, seed import.
  core/data/                Repositories, sync orchestration. The only place that knows
                            both the database and the network exist.
  core/network/             DTOs (Zod), API client, DTO->domain mappers.
  core/prefs/               MMKV-backed preferences.
  core/testing/             Fakes, in-memory db factory, render helpers.

  features/roster/          RosterScreen, useRoster, roster UI types.
  features/player/          PlayerDetailScreen (Stats + Vs You), usePlayerDetail.

assets/fonts/               Cinzel, Barlow, JetBrains Mono (OFL) + licences
assets/seed.json            Phase 2 bootstrap dataset
```

**Dependency rule, enforced in CI** by `eslint-plugin-boundaries` (or
`import/no-restricted-paths`), failing the lint job exactly as the Gradle task failed the build:
`features/*` may import from `core/model`, `core/common`, `core/design-system`, `core/data`. A
feature may **never** import `core/db`, `core/network`, or another feature. `core/model` imports
nothing.

This is the same boundary as the Kotlin proposal and it exists for the same reason: it is what
stops formatting logic and database row types leaking into components — the exact leak that makes
the "show every stat twice" rule impossible to test. The enforcement is genuinely weaker than
Gradle's, because it is lint-time rather than compile-time and can be silenced with a disable
comment. So the CI job is non-optional, the rule is `error`, and a disable comment on it is a
review conversation.

---

## 5. Domain model

```ts
// src/core/model — no React, no Drizzle, no Zod

export type PlayerId = string & { readonly __brand: 'PlayerId' };

export type StatKey = 'ATK' | 'DEF' | 'CRIT' | 'HIT' | 'SPD';

export interface Player {
  id: PlayerId; // stable server id — NOT the display name
  name: string;
  rank: number; // absolute season rank, 1-based
  combatPower: number; // safe integer, < 2^53 (see §2.1)
  score: number;
  atk: number;
  def: number;
  critBp: number; // percent x 10_000. 58.4127% -> 584127
  hit: number;
  spd: number;
}

export interface HeadToHead {
  viewerId: PlayerId;
  opponentId: PlayerId;
  wins: number;
  losses: number;
}

export const played = (h: HeadToHead): number => h.wins + h.losses;

export type RosterSort = 'RANK' | 'COMBAT_POWER' | 'MY_WINS';
```

Two notes.

`PlayerId` is a **branded string** — the closest TypeScript gets to Kotlin's `value class`. It is
erased at runtime and costs nothing, but it stops a raw `string` (a name, a route param) being
passed where an id is required. Route params arrive from Expo Router as `string`, so
`app/player/[id].tsx` is the one place that brands them, after confirming the row exists.

`id` deserves the same note it did before. The prototype identifies players by name —
`DB.findIndex(x => x.name === p.name)` — and then indexes a _sorted_ array with that index. Two
players called "Skarn" break navigation, and any change to sort ordering breaks it silently. This
model uses a server-issued stable id from day one, and it is what the route is keyed on.

---

## 6. Formatting contract

"Every huge stat shown twice" is the product's core idea, so formatting is a tested module in
`core/common`, not template interpolation inside a component.

```ts
export type ShortUnit = 'BILLIONS' | 'MILLIONS' | 'SCIENTIFIC'; // "B" | "M" | "e9"

export interface StatFormatter {
  exact(value: number): string; // 2,418,904,113
  short(value: number, unit: ShortUnit): string;
  combatPowerShort(cp: number): string; // "3.08 M"
  critExact(bp: number): string; // "71.2043 %"
  critShort(bp: number): string; // "71.2%"
  deltaPercent(mine: number, theirs: number): string; // "+31.2%"
}
```

Behaviour ported verbatim from the prototype's `full()` / `short()`:

- `BILLIONS` — `v / 1e9`, then **2** decimals below 10, **1** decimal from 10 to <100, **0** at
  ≥100, suffix `" B"`.
- `MILLIONS` — `round(v / 1e6)`, grouped, suffix `" M"`.
- `SCIENTIFIC` — `v / 1e9` at 3 decimals, suffix `"e9"`.
- `combatPowerShort` — always `v / 1e6` at 2 decimals + `" M"`.

Three things this platform must decide explicitly:

- **Rounding.** Half-up, implemented in `core/common`, **not** `toFixed` — see §2.2 for the
  verified counterexample at the `9.995 B` boundary. Asserted by unit test at every boundary
  (`9.995 B`, `99.95 B`, `100 B`).
- **Locale.** The prototype hardcodes `toLocaleString('en-US')`. `Intl.NumberFormat` is the right
  API and Hermes ships an `Intl` implementation, but **coverage differs by platform and by ICU
  availability in the build** — so Phase 0 verifies grouping output on a real Android device, not
  in Node, and the formatter keeps a hand-rolled grouper as fallback. Proposal: format with the
  user's locale (`expo-localization`), pin the tests to `en-US` so CI is deterministic.
- **Digit alignment.** The exact column is monospaced for visual alignment. JetBrains Mono handles
  it, and every numeric `<Text>` additionally sets `fontVariant: ['tabular-nums']` so a fallback
  font cannot make the column jitter mid-scroll.

`ShortUnit` is a user preference in MMKV (it is a design-time prop in the prototype), so the detail
screen needs a way to change it — currently there is no UI for that. See §9.

---

## 7. Data layer — offline-first

```
Remote API ──► sync task ──► SQLite (single source of truth) ──► useLiveQuery ──► UI
                              ▲
                   assets/seed.json (Phase 2 bootstrap)
```

SQLite is the only thing the UI reads from. **The network never reaches a component — and neither
does TanStack Query's cache.** `useQuery`/`useMutation` own the sync call's lifecycle (retry,
backoff, "is a refresh in flight"); success writes rows. Screens subscribe to Drizzle's
`useLiveQuery`. Offline, cold-start and post-sync then take the same code path, and there is no
"is this stale?" branching in the UI.

This is the one architectural rule most likely to be violated by habit, because the standard React
Native reflex is to render `data` straight out of `useQuery`. Doing so here reintroduces exactly
the branching the offline-first design exists to delete, so it is called out in review and guarded
by the §4 boundary (a feature cannot import `core/network` at all).

```ts
export interface RosterRepository {
  observeRoster(sort: RosterSort, query: string): LiveQuery<RosterEntry[]>;
  observePlayer(id: PlayerId): LiveQuery<PlayerDetail | null>;
  observeViewer(): LiveQuery<Player | null>;
  refresh(): Promise<Result<void>>;
}
```

Sorting and filtering belong in **SQL**, not in JS over an in-memory array. The prototype sorts a
14-element array in the render path; that stops being acceptable the moment the roster is a real
season ladder. Indices on `rank`, `combat_power`, and the h2h `wins` column; name search via
`LIKE` initially, FTS5 if the roster grows.

Migrations run once in the root `_layout.tsx` via `useMigrations`, gating first paint behind the
splash screen. `drizzle-kit`-generated SQL is committed, so schema drift is reviewable in a diff.

One product bug to resolve at this layer: the prototype's viewer has `rank: 12` while the roster
independently ranks 14 players 1–14, and reports `count = DB.length + 1 = 15`. The viewer and the
roster must come from **one** ranked list, with the viewer flagged rather than stored separately.

**Phase 2 bootstrap.** `localSeedRosterSource` reads the prototype's 14 players from
`assets/seed.json` and populates SQLite. It implements the same interface the real remote source
will. This unblocks all UI work before any backend exists, and later becomes the fixture that
visual tests and demo builds run against.

---

## 8. Presentation

Unidirectional data flow. The Kotlin proposal's ViewModel is a **hook** here; the contract it has
to honour is identical, and stating it as a contract matters more than the mechanism.

```ts
type RosterUiState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; canRetry: boolean }
  | { kind: 'empty'; query: string } // search matched nothing
  | {
      kind: 'ready';
      viewer: ViewerCardUi;
      rows: RosterRowUi[];
      sort: RosterSort;
      query: string;
      isRefreshing: boolean;
    };
```

Rules:

- A screen consumes exactly one `useRoster()` returning `{ state, onEvent }`. The state is a
  discriminated union, so an impossible combination (`error` _and_ `rows`) cannot be represented —
  this is what the Kotlin `sealed interface` bought, and it ports directly.
- UI state holds **pre-formatted strings**. A component never calls the formatter. This is what
  makes formatting testable without rendering, and it is what the §4 boundary protects.
- No SQLite row types and no Zod DTOs above `core/data`; the hook maps to `*Ui` types.
- Search input is local component state, debounced (~250 ms) into the query that drives SQL.
  Keystroke latency must never wait on a query round-trip.
- The row component is memoised; the screen is not. Roster rows re-render on every list update
  otherwise, and the roster is the surface where that shows.

The prototype has no loading, empty, or error state — searching for a non-existent player yields a
blank screen. Those three states are new work, not porting work, and are budgeted as such.

---

## 9. Open decisions — these need answers

Ordered by how much rework a late answer causes. **Items 1–5, 7–9 are unchanged from the Kotlin
proposal** — they are product questions, and the framework has no opinion on them.

1. **Is there a backend, and what is it?** Everything in §7 assumes a REST roster endpoint. If the
   data comes from a game client, a scraped source, or manual entry, the network module changes
   shape entirely. _Phases 1–4 are deliberately built against the local seed so this can be
   answered late without stalling — but it must be answered before Phase 5._ **New sub-question:**
   the contract must state the maximum stat magnitude (§2.1), and whether values above 2^53 will
   ever be sent — if so they transport as strings.
2. **How large is a real roster?** 14 rows needs nothing. 10 000 rows needs cursor pagination,
   FTS5, and a different sort strategy. This decision changes Phase 3 materially.
3. **How is "your avatar" identified?** Login? A locally chosen player? A device-bound profile?
   This determines whether there is an auth story at all — currently none is budgeted.
4. **Where does head-to-head data come from?** It cannot be derived from roster stats; something
   must record match outcomes.
5. **AA contrast fix — approve or waive?** §2.4 requires either raising the faint tiers to α ≥ 0.50
   (a visible change from the prototype) or an explicit, documented waiver.
6. **iOS: in or out?** _New, and the reason this decision exists at all._ React Native makes iOS
   reachable, but it is not free: an Apple Developer account, a second store listing and review
   cycle, iOS-specific insets and back-gesture behaviour, `Intl`/ICU verification on a second
   engine, and a second device matrix in QA and CI. Estimated **+6 to +8 days** on top of the
   roadmap, almost all of it in Phases 6 and 7 rather than in feature work. The architecture stays
   iOS-capable either way — no platform forks in feature code, `Platform.select` confined to
   `core/design-system` — so this can be answered as late as Phase 6, but not later.
7. **Does `shortUnit` become a user-facing setting?** It is a design-time knob today. If yes, a
   third screen (Settings) enters scope.
8. **Season semantics.** "SEASON 41" is hardcoded. Is it dynamic, and does history persist?
9. **Localisation scope.** English-only ships faster; the number formatting above is built to
   handle locales either way, but the copy is not.
10. **OTA update policy.** _New._ EAS Update can ship JS-only fixes outside store review. That is a
    real operational benefit and a real governance question: who may publish, to which channel, and
    what the rollback procedure is. Needs an answer before the first external build, not after.

Fonts are _not_ an open question: Cinzel, Barlow, and JetBrains Mono are all SIL Open Font License,
so they can be bundled in `assets/fonts` and loaded via `expo-font` offline, without a licence
purchase or a runtime font-service dependency.

---

## 10. Testing strategy

| Layer                | Tool                                     | What it protects                                                                                                                                      |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting & domain  | Jest, plain Node (no RN preset)          | The safe-integer and `critBp` correctness from §2 — including explicit regression tests at `Int32.MAX + 1` and at `Number.MAX_SAFE_INTEGER`           |
| Contract             | Zod schema tests                         | That an unsafe integer, or a float in an integer field, is **rejected** rather than coerced                                                           |
| Queries              | Drizzle against `better-sqlite3` in Node | Sort and search correctness at the SQL layer, with no emulator and no device                                                                          |
| Repository           | Fakes from `core/testing`                | Offline behaviour, refresh failure handling                                                                                                           |
| Hooks                | React Testing Library `renderHook`       | State transitions, incl. the empty/error states the prototype lacks                                                                                   |
| Components & screens | React Native Testing Library             | Rendering, navigation, search, sort, tab switching — queried by accessibility role and label, so the Phase 6 a11y work is exercised by the same tests |
| Visual               | **Maestro on-device screenshots**        | That the exact + rounded pair both render unclipped, at 200 % font scale                                                                              |
| Flows                | Maestro                                  | Roster → detail → Vs You → back                                                                                                                       |

**The visual layer is a genuine regression from the Kotlin plan, and is called out rather than
buried.** Roborazzi rendered Compose components to PNGs on the JVM — no emulator, seconds per run,
cheap enough to gate every PR. React Native has no equivalent: the component tree becomes pixels
only on a device or simulator. The options, and why the pick:

- **Jest snapshot tests are not a substitute.** They serialise the element tree, so a clipped or
  ellipsised number produces an identical snapshot. Given the product's promise is "the number is
  visible in full", snapshots would give false confidence precisely where it matters most. Used
  only for cheap structural regressions, never as the visual gate.
- **`react-native-web` + Playwright** would restore JVM-like speed, but it tests a different
  renderer than production ships, and text layout — the exact failure mode in question — is where
  web and native diverge most.
- **Maestro screenshots on a CI emulator** are slower (minutes, not seconds) and need a device
  image, but they measure the real thing.

Decision: Maestro, on a fixed emulator profile, at default and 200 % font scale, against the
largest player in the seed. It runs on PR; if it proves too slow it moves to a merge-queue or
nightly gate — but it does not get replaced by snapshots.

---

## 11. Quality gates and CI

- **Static analysis:** ESLint (`eslint-config-expo` + `@typescript-eslint`), Prettier, and
  `tsc --noEmit` under `strict`. `toFixed` is banned inside `core/common` by a
  `no-restricted-syntax` rule whose message names §2.2.
- **Boundary check:** `eslint-plugin-boundaries` at `error`, failing CI if a `features/*` file
  imports `core/db` or `core/network` (§4).
- **Dependency hygiene:** `expo-doctor` in CI — it catches the version-mismatch class of failure
  that SDK upgrades produce, which is otherwise diagnosed by hand at native build time.
- **CI (GitHub Actions):** on every PR — typecheck, lint, boundary check, unit + query + component
  tests, `expo-doctor`, and an EAS Build of the development profile. Maestro flows and screenshots
  on an emulator.
- **Release:** EAS Build (production profile), Hermes bytecode, R8 for the Android native shell,
  App Bundle output, Sentry sourcemap upload wired into the build, EAS Submit to the Play internal
  track, and EAS Update channels for JS-only fixes under the §9.10 policy.
- **Performance budget:** roster scroll with no dropped frames, asserted against a 1 000-row seed
  rather than checked by hand. **Cold start: < 2.0 s** on a mid-tier device, to first meaningful
  paint. This is a deliberate loosening of the Kotlin plan's 1.5 s: RN additionally pays for Hermes
  bytecode load, JS bundle evaluation, and runtime init before the first render. Setting 1.5 s here
  would be a budget the framework fails by construction, and a budget that is routinely missed
  stops being a gate. Font preloading and migration-on-boot both land inside this window, so both
  are measured rather than assumed.
