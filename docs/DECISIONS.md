# Decisions (ADRs)

One entry per decision that would otherwise be re-litigated. Newest last.
Open questions live in [ARCHITECTURE.md §9](ARCHITECTURE.md); they move here once answered.

---

## ADR-0001 — Pin Expo SDK 57 / React Native 0.86.2

**Date:** 2026-08-14 · **Status:** accepted · **Phase:** 0

**Context.** ARCHITECTURE.md §3 says to pin the SDK at project start and record it. At the
time of writing, `expo@latest` is **57.0.13** and `react-native@latest` is **0.87.0** — but
the version SDK 57 is built and tested against is **0.86.2**.

**Decision.** Pin `expo ~57.0.13`, `react-native 0.86.2`, `react 19.2.3`. Add dependencies
with `npx expo install`, never bare `npm install`, so the SDK resolves the compatible
version rather than the newest one. Two examples from this phase: `@shopify/flash-list`
resolved to **2.0.2** where npm's latest is 2.3.2, and `jest-expo` was installed through
`expo install` for the same reason.

**Consequences.** Upgrades are scheduled work with their own ADR, not a side effect of an
install. `expo-doctor` runs in CI to catch drift. The cost is being a version or two behind
`latest` on individual libraries, which is the intended trade.

---

## ADR-0002 — Routes live in `src/app/`, not `app/`

**Date:** 2026-08-14 · **Status:** accepted · **Phase:** 0

**Context.** ARCHITECTURE.md §4 was written with routes at the repository root (`app/`).
The SDK 57 default template puts them at `src/app/`. Expo Router supports both.

**Decision.** Follow the template: `src/app/`. Everything lives under `src/`, and the
`@/*` path alias maps to `./src/*`.

**Consequences.** ARCHITECTURE.md §4 updated to match. Following the template's convention
means future `create-expo-app` output, upgrade guides and community answers line up with
this repo instead of needing translation.

---

## ADR-0003 — Keep React Compiler enabled

**Date:** 2026-08-14 · **Status:** accepted · **Phase:** 0

**Context.** `experiments.reactCompiler` is **on by default** in the SDK 57 template.
ARCHITECTURE.md §8 was written assuming manual memoisation, and says the roster row
component is memoised while the screen is not.

**Decision.** Leave it on.

**Consequences.** The manual `React.memo` guidance in §8 becomes a fallback rather than a
rule: the compiler should handle row memoisation automatically. **This is not yet
verified** — Phase 3 measures the 1 000-row scroll with the compiler doing the work, and if
rows still re-render, the manual memo goes back in and this ADR gets a follow-up. Treat §8's
memoisation sentence as provisional until then.

---

## ADR-0004 — Android only; no web target

**Date:** 2026-08-14 · **Status:** accepted · **Phase:** 0

**Context.** ARCHITECTURE.md §9.6 keeps iOS as a costed open decision. Web was never in
scope. The template ships `react-native-web`, `react-dom`, a `web` block in the config, and
`.web.tsx` component variants.

**Decision.** No `web` block in `app.config.ts`, no `ios` block, no `react-native-web`, and
no web build script. `react-dom` **is** kept as a direct dependency — see below.

**Consequences.** Removing `react-dom` breaks `npm install` outright. `expo-router@57`
depends on `vaul` and `@radix-ui/*` for its dev overlay; those peer-depend on `react-dom`,
which then floats to `19.2.8` and demands `react@^19.2.8` while the SDK pins `react@19.2.3`.
Declaring `react-dom` at exactly `19.2.3` keeps the two in lockstep and the tree resolvable.

So: the app does not target web, but the dependency cannot be pruned. Recorded because it
looks like dead weight and will otherwise be "cleaned up" by someone, breaking the install.

---

## ADR-0005 — Jest split into `node` and `native` projects

**Date:** 2026-08-14 · **Status:** accepted · **Phase:** 0

**Context.** ARCHITECTURE.md §10 runs domain and formatting tests in plain Node with no RN
preset, and component tests through `jest-expo`.

**Decision.** One `jest.config.js` with two projects. `src/core/**/*.test.ts` (excluding
design-system) runs on `testEnvironment: 'node'`; components, hooks and screens run under
the `jest-expo` preset.

**Consequences.** The tests that guard the §2 numeric rules stay fast enough to run on
every save and cannot accidentally acquire a React Native dependency. Snapshot testing is
deliberately not configured as a visual gate — see the note in `jest.config.js`.

---

## ADR-0006 — Module-boundary rule is written but NOT yet enforcing

**Date:** 2026-08-14 · **Status:** ⚠️ open / blocked · **Phase:** 0

**Context.** The Phase 0 exit criterion is not "the rule is configured", it is "a deliberately
added illegal import fails CI". That test was run, and it **failed to fail**:

```
# src/features/roster/index.ts
import { DATABASE_NAME } from '../../core/db';   // illegal per §4

$ npx eslint src/features/roster/index.ts
eslint exit code: 0        # ← guardrail did not fire
```

The cause is a major-version API change. `eslint.config.js` was written against
`eslint-plugin-boundaries` v5 syntax (`boundaries/element-types` + `rules` + string
selectors). The installed version is **7.2.0**, where the rule is renamed to
`boundaries/dependencies` and takes `policies` with object selectors. The old shape is
accepted, warned about, and **silently ignored** — so lint passes and reports nothing.

Retried with the `@/core/db` alias and with a relative path: same result, so this is not an
import-resolver problem.

**Status.** The migrated config is drafted but not applied: a repository `config-protection`
hook blocks edits to `eslint.config.js`. That hook is doing its job — it cannot distinguish
"weakening a rule to silence errors" from "repairing a rule that enforces nothing" — so
unblocking it is an explicit human decision, not an automated one.

**Until it is applied, the §4 boundary is documentation, not enforcement.** Treat every
import in `src/features/` as unguarded. This matters most in Phase 3, which is the first
phase that writes real feature code.

**Next action.** Temporarily disable the config-protection hook, apply the v7 migration, and
re-run the failing-import test above. The criterion is met when that command exits non-zero
with an ARCHITECTURE.md §4 message — not before.

**Re-verified 2026-08-18** while building Phase 2. Unchanged: the same illegal import still
exits 0, and `npx eslint .` still prints the v7 deprecation warnings on every run. Phase 2
wrote no feature code, so nothing shipped unguarded — but Phase 3 does, and this is now the
oldest open item blocking it.

---

## ADR-0007 — Phase 0 left two toolchain gaps that only a real test could find

**Date:** 2026-08-18 · **Status:** accepted · **Phase:** 2

**Context.** Phase 0 configured the Jest projects and the typecheck, but shipped with
`jest --passWithNoTests` and zero test files. Both configurations were therefore
declared and never executed. The first Phase 2 test run failed twice before it ran:

```
Cannot find module 'babel-preset-expo'      # jest.config.js referenced it; nothing declared it
error TS2593: Cannot find name 'describe'   # TypeScript 6 no longer auto-includes @types/*
```

`babel-preset-expo` existed only nested under `node_modules/expo/`, which Babel cannot
resolve from the project root. And TypeScript 6.0.3 does not pull every
`node_modules/@types` package in without a `types` entry, so `@types/jest` was installed
and inert.

**Decision.** Declare `babel-preset-expo` as a devDependency (build-time only — it is
never bundled) and add `"types": ["jest", "node"]` to `tsconfig.json`.

**Consequences.** A configuration nobody has run is a configuration nobody has checked.
This is the same class of finding as ADR-0006, and the same lesson: the Phase 0 exit
criteria were written as "verify it fails" for a reason, and the two criteria that were
not written that way are the two that were wrong. Phase 1 should assume its own test
scaffolding is unproven until a test fails for the right reason.

---

## ADR-0008 — One ranked list of 15, viewer at rank 9

**Date:** 2026-08-18 · **Status:** accepted · **Phase:** 2

**Context.** ARCHITECTURE.md §7 and prototype defect 4: the prototype ranks 14 players
1–14, gives the viewer an independent `rank: 12`, and reports `count = DB.length + 1 = 15`.
Three numbers that cannot all be true.

**Decision.** `assets/seed.json` is one ranked list of 15 with the viewer flagged rather
than stored separately. Ordering is score descending — the order the prototype's own `DB`
array is already in. Krios (score 1842, CP 2,145,880) lands at **rank 9**, and the count
of 15 turns out to have been right by accident.

The merge was checked against combat power as well as score: both orderings produce the
identical sequence for all 15, so the single list is not an artefact of picking a key.
`localSeedRosterSource` asserts the ranks form a contiguous `1..n` on every load, so the
inconsistency cannot walk back in through a hand-edited seed.

**Consequences.** The "registered players" count is now `players.length`, not
`length + 1`. Player ids are opaque and deliberately non-ordinal (`plr_9d41c0`), so
nothing can derive an id from a name or a rank — which is the prototype's actual
navigation bug (defect 2), not just its symptom.

---

## ADR-0009 — Half-up means ties away from zero, and the formatter takes a locale

**Date:** 2026-08-18 · **Status:** accepted · **Phase:** 2

**Context.** ARCHITECTURE.md §2.2 bans `toFixed` and requires "a half-up helper
implemented in integer arithmetic", without saying which half-up or which locale.

**Decision.** Three things, stated because each is a fork:

- **Ties round away from zero**, i.e. Java's `RoundingMode.HALF_UP` rather than
  round-half-ceiling. This is the rule the Kotlin proposal's `BigDecimal` would have used.
- **No float is ever produced.** `divideHalfUp` takes the remainder first
  (`abs % d`, then `(abs - r) / d`), both exact for safe integers, and decides the tie on
  `2r >= d`. Rounding a double half-up would still answer "9.99" for 9.995, because by
  then the value is 9.99499999999999921 — the defect is upstream of the rounder.
- **`createStatFormatter(locale)`**, with the default instance pinned to `'en-US'`.
  Grouping is probed at construction: if `Intl` groups correctly it is used, since it
  knows the locales that do not group in threes; otherwise a hand-rolled grouper takes
  over. The §6 fallback is therefore always present rather than conditional on a device
  check, and `expo-localization` stays out of core/common so the module keeps running in
  plain Node.

**Consequences.** The Phase 0 exit criterion "`Intl.NumberFormat('en-US').format(...)` on
a real Android device" is **still worth running** — it decides whether the separators come
from ICU or the fallback — but it is no longer load-bearing for correctness. Tests cover
`9.995 B -> "10.00 B"`, `99.95 B -> "100.0 B"`, `100 B`, `Int32.MAX + 1`,
`MAX_SAFE_INTEGER`, rejection above 2^53, and `71.05 % -> "71.1%"` (where `toFixed(1)`
answers `"71.0"`) — the crit-scale twin of the 9.995 case.

---

## ADR-0010 — `deltaPercent` signs from the rounded value; a zero baseline renders "—"

**Date:** 2026-08-18 · **Status:** accepted, pending product confirmation · **Phase:** 2

**Context.** The prototype computes `pct = (theirs - mine) / mine * 100` and renders
`(pct >= 0 ? '+' : '') + pct.toFixed(1)`. Two edges fall out of that: the sign is decided
on the _unrounded_ value, so a delta of −0.04 % renders `"-0.0%"`; and `mine === 0`
divides by zero and renders `Infinity`.

**Decision.** The sign follows the rounded value, so a hairline deficit renders `"+0.0%"`.
A zero baseline returns the em dash `"—"` rather than throwing or emitting `Infinity`.

**Consequences.** Both are deliberate divergences from the ported behaviour and are
tested as such. `"—"` is a placeholder for a product answer, not the answer: ROADMAP.md
Phase 4 already owns the Vs You semantics (defects 6 and 7 — tie handling and the
inverted-reading delta colour), and this belongs in the same conversation. If Phase 4
decides the row should say something explicit, the change is one constant.

---

## ADR-0011 — The `RosterSource` port lives in core/common

**Date:** 2026-08-18 · **Status:** accepted · **Phase:** 2

**Context.** `localSeedRosterSource` (core/data) and the Phase 5 remote source
(core/network) must implement the same interface. §4 forbids core/network from importing
core/data, so the port cannot live where its first implementation lives. It cannot live in
core/model either, because it returns `Result<RosterSnapshot>` and core/model imports
nothing.

**Decision.** `RosterSource` and `RosterSnapshot` live in `core/common`, alongside
`Result`. core/network, core/data and core/db may all import it, which is exactly the set
that needs it.

**Consequences.** Phase 5's "the `features/` diff for this phase is empty" exit criterion
now has a mechanism behind it rather than a hope: the only line that changes is which
source is passed to `createRosterRepository`. `RosterEntry` and `PlayerDetail` — referenced
by §7 but never located — are in core/model, since both are pure aggregates.

---

## ADR-0012 — Observers return `{ query, map }`, and `ArenaDatabase` is widened with `any`

**Date:** 2026-08-18 · **Status:** accepted · **Phase:** 2

**Context.** §7 has the repository return `LiveQuery<T>` observers, and §10 requires sort
and search to be tested "against `better-sqlite3` in Node — no emulator in this phase's
test loop". `useLiveQuery` is a React hook that takes a Drizzle query, so a repository that
returned data would have to call it, which would pull React and `expo-sqlite` into the one
layer that has to stay runnable in Node.

**Decision.** Each observer returns `{ query, map }`: the Drizzle query, and the mapping
from its rows to domain objects. On device the query goes to `useLiveQuery` and `map` is
applied to the result; in Node the test calls `query.all()` and applies the same `map`. The
generic is over the query type, so the concrete Drizzle type survives to the call site
instead of pushing a cast into every screen.

`ArenaDatabase` is `BaseSQLiteDatabase<'sync', any>`. `unknown` was tried first and does
not work: `transaction(cb)` puts the result type in a callback parameter, which makes the
type invariant there, so with `unknown` **neither** driver is assignable and the seam does
not exist at all. The `any` is confined to a type no query in the module reads.

**Consequences.** 55 tests run in about two seconds with no emulator, including all three
sorts, case-insensitive search, LIKE-wildcard escaping, and survival across a close/reopen
of a real database file. The cost is one `any` and one indirection at each call site;
Phase 3 is where that indirection is judged in practice.

Two smaller decisions recorded here rather than in their own entries:

- `babel.config.js` and `metro.config.js` now exist, solely so `babel-plugin-inline-import`
  can inline the generated `.sql` files that drizzle-kit's `driver: 'expo'` output imports.
  Without them the migrations bundle does not resolve.
- Search escapes `%`, `_` and `\` and declares `ESCAPE '\'`. Unescaped, a search for `_`
  matches every row — so the test asserts that a query of `_` returns the one player whose
  name contains a literal underscore, not merely that it returns nothing.

---

## Still open

These block or shape later phases and are **not** decided. Full text in
[ARCHITECTURE.md §9](ARCHITECTURE.md).

| #   | Question                                                                 | Needed by          |
| --- | ------------------------------------------------------------------------ | ------------------ |
| 1   | Is there a backend, and what is its contract (incl. max stat magnitude)? | Phase 5            |
| 2   | How large is a real roster?                                              | Phase 3            |
| 3   | How is "your avatar" identified?                                         | Phase 3            |
| 4   | Where does head-to-head data come from?                                  | Phase 4            |
| 5   | AA contrast fix — approve or waive?                                      | **Phase 1 (next)** |
| 6   | iOS in or out (+6 to +8 days)?                                           | Phase 6            |
| 7   | Does `shortUnit` become user-facing?                                     | Phase 4            |
| 8   | Season semantics — is "SEASON 41" dynamic?                               | Phase 3            |
| 9   | Localisation scope                                                       | Phase 6            |
| 10  | OTA update governance                                                    | Phase 7            |

Decisions 1, 2 and 5 are the Phase 0 exit criteria. 5 is the urgent one: Phase 1 builds the
token module, and answering it afterwards means rebuilding every component that consumed a
token.

**Moved by Phase 2.** Decision 7 (`shortUnit` user-facing) was listed against Phase 2 and is
now against Phase 4. Phase 2 owed it a stored preference, and that exists — `core/prefs`
persists `shortUnit` and the formatter already takes it per call. What is still missing is a
_control_, and the only screen with somewhere to put one is the detail screen. Nothing is
blocked by the delay; the preference is written and read today.

Decision 8 (`SEASON 41`) is unblocked cheaply: the seed carries `meta.season`, so whichever
answer Phase 3 gives, the value is already data rather than a literal in a template.
Decision 3 ("how is your avatar identified?") is answered _provisionally_ — the roster source
declares the viewer id and `core/prefs` caches it. That is enough for a seed and will not
survive a real backend.
