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

**Patch drift, 2026-08-20.** `expo-doctor` had been failing since Phase 0 — not on anything
this project did, but because SDK 57 moved on: `expo`, `expo-router`, `expo-splash-screen`,
`expo-linking` and `expo-background-task` were each a patch behind what the SDK expects.
Realigned with `npx expo install --fix`, which is the tool this ADR already mandates, and
`expo-background-task` gained its config plugin in `app.config.ts` at the same time.
`expo-doctor` now reports 21/21.

Patch alignment inside a pinned SDK is not the kind of upgrade the paragraph above is about
— it is the drift `expo-doctor` exists to catch, and letting it accumulate turns a red CI
step into background noise, which is worse than the drift.

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

## ADR-0006 — Module-boundary rule was written but enforced nothing

**Date:** 2026-08-14 · **Status:** resolved 2026-08-18 · **Phase:** 0, closed in 2

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

**Until it was applied, the §4 boundary was documentation, not enforcement.** Treat every
import in `src/features/` as unguarded. This matters most in Phase 3, which is the first
phase that writes real feature code.

**Next action.** Temporarily disable the config-protection hook, apply the v7 migration, and
re-run the failing-import test above. The criterion is met when that command exits non-zero
with an ARCHITECTURE.md §4 message — not before.

**Re-verified 2026-08-18** while building Phase 2. Unchanged: the same illegal import still
exits 0, and `npx eslint .` still prints the v7 deprecation warnings on every run. Phase 2
wrote no feature code, so nothing shipped unguarded — but Phase 3 does, and this is now the
oldest open item blocking it.

**Resolved 2026-08-18.** The diagnosis above was right about the symptom and wrong about the
cause, which is worth recording because the wrong cause was the plausible one.

Migrating to v7 syntax removed every deprecation warning and changed nothing: the illegal
import still passed. The plugin's own debug output said why.

```
$ ESLINT_PLUGIN_BOUNDARIES_DEBUG=1 npx eslint src/features/roster/__probe.ts
[boundaries][debug]: Description of file "src/features/roster/__probe.ts":
  { "element": { "types": null, "captured": null, "isUnknown": true }, ... }
```

**`isUnknown: true`.** No file in the project was ever classified as any element, so no
policy could apply to anything. `boundaries/elements` patterns describe **folders**, and
Phase 0 wrote them as file globs — `src/core/db/**/*` where the plugin wanted
`src/core/db`. That defect is independent of the version; the v5 config would have enforced
nothing either. The deprecation warnings were a real problem sitting on top of a different
real problem, and fixing only the loud one left the rule exactly as inert as before.

The fix is therefore two changes, not one:

- Element patterns are folder patterns (`src/features/*` with `capture: ['feature']`).
- The rule is `boundaries/dependencies` with `policies`, object selectors and `{{...}}`
  templates.

One genuine violation surfaced the moment the rule woke up: `rosterRepository.test.ts`
imports `core/testing`, which no policy allowed. Rather than widen core/data's permissions,
test files are now classified (`boundaries/files`, category `test`) and the exception is
stated as "a test may reach the fakes". Production code still cannot — verified, because
core/testing opens a real `better-sqlite3` handle that must never reach a bundle.

**The criterion is now met, and it stays met.** `npm run check:boundaries` writes eight
deliberate probes — six that must be rejected, two that must be allowed — lints each, and
fails if any behaves differently. It runs as its own CI step, separate from `Lint`, because
that is the whole lesson here: a clean `eslint .` is indistinguishable between a rule that
enforces and a rule that classifies nothing. The check was itself checked by reintroducing
the folder-pattern defect and confirming it fails.

**Config protection.** The hook that blocked `eslint.config.js` in Phase 0 did not fire on
this edit. Recorded so the next person is not surprised in either direction.

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

## ADR-0013 — The contrast floor is implemented, and is a test rather than a comment

**Date:** 2026-08-20 · **Status:** accepted, pending design sign-off · **Phase:** 1

**Context.** ARCHITECTURE.md §2.4 measures six of the prototype's text opacities against
WCAG AA and finds all six failing, between 2.44:1 and 3.67:1. It states the fix as a
decision — "any token intended for text clamps at α ≥ 0.50" — while ROADMAP.md keeps design
approval open as decision 5. A token module cannot defer: it has to write a number down.

**Decision.** Implement the clamp. `color.text.*` holds five values from α 0.50 to 1.0;
`color.decorative.*` holds the sub-floor values the design uses for hairlines, bar tracks
and chip fills, where contrast does not apply because nothing there is text.

The measurements were re-derived from the sRGB definition rather than copied, and they
reproduce §2.4 exactly. One value §2.4 does not list: α 0.50 on the `raised` surface is
**4.66:1**, so the floor holds on all three backgrounds rather than only on `surface`.

`tokens.test.ts` computes every ratio at run time and fails below 4.5:1. It also asserts
the converse — that every `decorative` token is _under_ 4.5:1 — because a decorative value
that starts clearing AA is usually a value that has quietly become text, and belongs in the
other group where the floor applies.

**Consequences.** If design waives AA, the waiver is one edit to `color.text` and one
deliberate change to the test. That is the whole reason the values live in one file, and it
is why implementing before sign-off is cheap rather than presumptuous. Until then the app is
AA-compliant on text contrast and the prototype's exact opacities are not what ships — a
visible difference the design review should be shown.

---

## ADR-0014 — Leading is a multiplier, and ArenaText is the only text in the app

**Date:** 2026-08-20 · **Status:** accepted · **Phase:** 1

**Context.** React Native scales `fontSize` with the OS font setting and does **not** scale
`lineHeight`. ARCHITECTURE.md §2.5 gives text scaling the same severity as the data
constraints, and the product's promise is a thirteen-character number rendered in full.

**Decision.** Three things, all in one place:

- **`lineHeight` is never stored in pixels.** The type scale carries a unitless `leading`
  and `ArenaText` computes `fontSize × leading × fontScale` at render. Most roles omit
  leading entirely and let the font metrics decide, which is what a single line wants anyway.
- **No `maxFontSizeMultiplier` by default.** Capping the scale is an accessibility
  regression, so it is opt-in per call site and Phase 6 audits each one. The layout is what
  has to survive 200 %, not the text — hence `flexWrap` and `rowGap` on every numeric row
  rather than `numberOfLines`.
- **Colour is a `tone`, not a string.** No prop accepts a hex, so the §2.4 floor is
  unavoidable rather than remembered.

`fontVariant: ['tabular-nums']` is set for every numeric role whether or not JetBrains Mono
is bundled, because the jitter it prevents is a property of the _fallback_ font.

**Consequences.** jest-expo runs at `fontScale` 2, so every component test in the design
system is already a 200 % font-scale test. That was luck rather than design, and it is
recorded here so nobody "fixes" the environment to 1 and quietly deletes the coverage.

---

## ADR-0015 — Spacing is keyed by its own value

**Date:** 2026-08-20 · **Status:** accepted · **Phase:** 1

**Context.** ROADMAP.md Phase 1 wants a spacing scale "typed `as const`, so a value outside
the scale is a type error rather than a review comment". The prototype uses sixteen distinct
spacing values. Sixteen semantic names is not a scale, it is a thesaurus; snapping to eight
steps changes a design the roadmap calls final.

**Decision.** `space[16]`, not `space.wide`. The keys are the numbers, so the scale holds
every value the design uses, `space[15]` does not compile, and a style reads the way the
prototype does. Two off-grid values are snapped — 9 px and 58 px, to 8 and 56 — because a
scale with a 9 in it is a list. Recurring roles get semantic aliases on top
(`layout.screenGutter`, `layout.cardPadding`, `layout.minTouchTarget`), which is where
intent belongs.

**Consequences.** The type system enforces membership; the ESLint rule enforces that
features go through it at all. Both are needed — the first cannot see a bare `24` written in
a screen's stylesheet, and the second cannot tell 16 from 15.

---

## ADR-0016 — Every architectural rule gets probes, and two more Phase 0 configs were untested

**Date:** 2026-08-20 · **Status:** accepted · **Phase:** 1

**Context.** ADR-0006 was a rule that looked configured and enforced nothing. ADR-0007 was
two configurations that were declared and never executed. Phase 1 adds a third rule of the
same kind — no raw colours or spacing outside core/design-system — and ran the jest-expo
project for the first time.

**Decision.** `scripts/lint-probe.mjs` is a shared runner; `check-boundaries.mjs` and
`check-design-tokens.mjs` are its two suites, seventeen probes between them, wired to
`npm run check:rules` and a CI step separate from `Lint`. A rule that has not rejected
something is not known to work.

One probe is not about tokens at all: it asserts that `toFixed` is _still_ rejected in
core/common. `no-restricted-syntax` is replaced wholesale by the last config block matching
a file, so adding the token rules in a second block would have silently deleted the §2.2
rounding ban for every file both covered. Nothing would have failed. That is ADR-0006's
failure mode exactly, and it is now a test.

**What running jest-expo for the first time found.** React Native Testing Library 14's
`render` is **async**. Without `await`, `screen` reports "render has not been called" for a
component that rendered perfectly well, and the render result is a bare promise. A second
`render` inside one test overlaps React's `act` scope and the queries then read the wrong
tree — so the convention is one render per test. Both are recorded because neither is
discoverable from the config, and Phase 0 shipped that config without running it.

---

## ADR-0017 — Phase 1 shipped without the fonts and without the screenshot gate

**Date:** 2026-08-20 · **Status:** fonts resolved; screenshot gate ⚠️ still open · **Phase:** 1

**Context.** Two Phase 1 deliverables could not be completed in the session that built the
rest, and both need a human rather than more code.

**The fonts.** Cinzel, Barlow and JetBrains Mono are OFL and must be committed under
`assets/fonts` with their licences. Fetching a font file is a download, and downloads are
the user's decision. `FONT_ASSETS` is empty, `FONTS_BUNDLED` is false, and every role falls
back to the platform face at the correct size and weight. `assets/fonts/README.md` lists the
eight files, and `typography.test.tsx` fails on a partial drop. **The app does not look
finished until this is done** — the display face is half its character.

**The screenshot gate.** ROADMAP.md Phase 1 wants Maestro baselines for every component at
default and 200 % font scale, and — more importantly — wants their wall-clock cost
_measured here_, because that measurement decides whether the gate survives two screens
(ARCHITECTURE.md §10). Maestro needs an emulator. Neither the baselines nor the measurement
exist, so the risk table's "visual regression gate too slow to run per-PR" mitigation has
not been exercised.

**What stands in for it meanwhile.** `src/app/catalogue.tsx` renders every component in one
scroll, keyed on the seed's largest player, with test ids ready for Maestro. The component
tests all run at `fontScale` 2. Neither proves a number is unclipped — only pixels do that,
which is the point §10 makes about snapshots.

**Fonts resolved 2026-08-20.** The eight faces and their licences are committed and
`FONTS_BUNDLED` is true. Three things came out of doing it that were not obvious beforehand:

- **The other thirty-two weights were deleted.** Google Fonts hands over about forty faces
  per family; every file under `assets/fonts` is bundled into the APK, so the unused ones
  were three megabytes of nothing. `fontLicenses.test.ts` now fails if a stray reappears.
- **The `require` map moved to `fontAssets.ts`.** An asset `require` only resolves under
  Metro, so leaving it in `typography.ts` would have pinned the whole type scale to the
  jest-expo project. Split out, `typography.ts` imports nothing at all and the scale is
  tested in the fast project beside the tokens. `lineHeightFor` lost its
  `PixelRatio.getFontScale()` default in the same move — a static read that would not
  re-render on an OS font-size change, which is the one thing it exists to track.
- **The licences were wrong, and nothing said so.** All three `OFL-*.txt` files were
  byte-identical copies of Barlow's, so Cinzel and JetBrains Mono shipped attributed to
  "The Barlow Project Authors". The OFL requires the copyright notice to travel with the
  font; this was a compliance break that no build step could see.

  The fix did not involve writing a copyright notice by hand. Each font carries its own in
  its TrueType `name` table (id 0), and the OFL 1.1 body is a fixed document identical
  across every OFL font — so the correct header was read out of the binary and put in front
  of the licence text that was already there. `fontLicenses.test.ts` now does the same read
  on every run and asserts the file matches the font. Verified by reverting one licence and
  confirming it fails.

**Still open: the screenshot gate.** Unchanged. Maestro needs an emulator, and the point of
running it in Phase 1 is to measure what it costs before two more screens depend on it.

**Next action.** Stand up Maestro against the catalogue route and record the run time in
ROADMAP.md Phase 1.

---

## Still open

These block or shape later phases and are **not** decided. Full text in
[ARCHITECTURE.md §9](ARCHITECTURE.md).

| #   | Question                                                                 | Needed by             |
| --- | ------------------------------------------------------------------------ | --------------------- |
| 1   | Is there a backend, and what is its contract (incl. max stat magnitude)? | Phase 5               |
| 2   | How large is a real roster?                                              | Phase 3               |
| 3   | How is "your avatar" identified?                                         | Phase 3               |
| 4   | Where does head-to-head data come from?                                  | Phase 4               |
| 5   | AA contrast fix — approve or waive?                                      | implemented, ADR-0013 |
| 6   | iOS in or out (+6 to +8 days)?                                           | Phase 6               |
| 7   | Does `shortUnit` become user-facing?                                     | Phase 4               |
| 8   | Season semantics — is "SEASON 41" dynamic?                               | Phase 3               |
| 9   | Localisation scope                                                       | Phase 6               |
| 10  | OTA update governance                                                    | Phase 7               |

Decisions 1, 2 and 5 are the Phase 0 exit criteria.

**Moved by Phase 1.** Decision 5 is no longer urgent, because the answer is now cheap to
change: the clamp is implemented (ADR-0013), so a waiver edits one object in `tokens.ts`
rather than every component that consumed a token. It still needs an answer — the app
currently renders text at higher contrast than the prototype does, and design has not seen
that.

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
