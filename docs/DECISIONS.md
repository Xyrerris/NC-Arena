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
| 3   | How is "your avatar" identified?                                         | answered, ADR-0022    |
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
Decision 3 ("how is your avatar identified?") is answered **for the offline app** by ADR-0022:
you pick one of your own rows on `/me`, and `core/prefs` remembers it. What is still open is
the part that needs a server — an identity a backend issues, and the auth story that comes
with it, neither of which is budgeted.

---

## ADR-0018 — The roster's header is state, its order is not tested through the list

**Date:** 2026-08-23 · **Status:** accepted · **Phase:** 3

**Context.** ARCHITECTURE.md §8 sketches `RosterUiState` as four cases, and ROADMAP.md Phase 3
asks for component tests proving that search narrows the list, a non-match shows the empty
state, each chip reorders, and the sort survives a restart. Building that turned up four
forks worth recording, because each one is a place where the obvious implementation is wrong.

**Decision 1 — `empty` carries the header.** §8's `{ kind: 'empty'; query }` has no viewer, no
count and no sort, so a screen rendering it faithfully would unmount the search field, the
sort chips and the hero card the moment a query matched nothing. That is prototype defect 5
one level up: the same reasoning that produced a blank screen, applied to the frame around it
instead of the list. `ready` and `empty` therefore share a `RosterHeaderUi`. The union still
makes the impossible unrepresentable — there are no rows on `empty` — which is the property
the discriminated union was for.

The empty _message_ lives inside the list as `ListEmptyComponent` rather than in place of it,
so a fruitless keystroke does not tear down and rebuild a recycler to show one sentence.

**Decision 2 — the repository arrives through context, and the live-query runner travels with
it.** `arenaRepository` opens a real `expo-sqlite` handle and a real MMKV store at module load,
so a screen that imported it could not be rendered in a test — and Phase 3's exit criteria are
component tests. `ArenaDataProvider` supplies `{ repository, useLiveData }`; `src/app/_layout.tsx`
builds it once at module scope, and a test builds it over `better-sqlite3`.

That `useLiveData` field is ADR-0012's other half. ADR-0012 said the cost of `{ query, map }`
was "one indirection at each call site, and Phase 3 is where that indirection is judged in
practice". The verdict: it is paid once, in `useRoster`, and it bought the entire test
strategy — the roster's sorts and searches are asserted against real SQL in about two seconds
with no emulator. Keep it.

**Decision 3 — the sort order is asserted through the hook, not through the rendered list.**
`FlashList` does not re-order in the jest environment. With no layout to measure, its recycler
keeps the window it built on the first commit, so a pure re-order of the same keys is invisible
to the renderer even though the data changed — verified directly, with a two-item list and a
button that swaps them. A test that pressed a chip and read the rendered rows would therefore
assert FlashList's test-environment behaviour rather than the sort.

So ordering is proven in `useRoster.test.tsx`, where it is a data question, and
`RosterScreen.test.tsx` keeps what is genuinely the screen's: that a chip press selects, is
announced as selected, and persists. **This makes the still-open screenshot gate (ADR-0017)
more load-bearing, not less** — the rendered order of the roster is now something only pixels
can confirm.

**Decision 4 — the season stopped being a literal.** Open decision 8 asked where "SEASON 41"
comes from. It comes from the source: `RosterSnapshot` carries `season`, `localSeedRosterSource`
reads `meta.season` from the seed it was already carrying, and the repository caches it in
preferences. It is a preference rather than a column because it describes the snapshot as a
whole, and one integer does not justify a migration and a table. Before the first sync the
header renders no season label at all, which is the same rule the viewer card follows: nothing
beats a guess. Season _history_ remains open.

**Consequences.**

- `rosterRepository` gained `observeRosterSize`, `getViewerId` and `getSeason`. The first is
  live because the count sits above a list a sync can grow underneath it; the other two are
  subscription keys — every observer resolves the viewer at call time, so a sync that discovers
  a different viewer has to re-key them.
- `core/testing` gained `createStubLiveData` and `createTestRepository`. The second exists
  because §4 forbids a feature from importing `core/prefs` **at all**, and a test file living
  inside a feature is still inside it — so the wiring a test needs goes through the module that
  is allowed to import everything. The boundary rule caught this; it was not noticed by hand.
- The viewer's own row shows no record. The prototype's `ME.record` is a hard-coded `0W · 0L`,
  and there is no head-to-head between a player and themselves to render instead.
- Two React-testing traps cost real time and are recorded so the next screen does not pay
  again. `render`, `renderHook`, `unmount` and `act` are all **async** in this version of RNTL,
  and a missing `await` on any of them corrupts the renderer for the _rest of the file_ rather
  than failing the test that caused it — the symptom is a later, unrelated test seeing an empty
  tree. Relatedly, fake timers do not drive the debounce: React's scheduler defers the state
  update produced by `fireEvent` into the same tick the timer advance runs in, so the settled
  value always lands one advance late. The search tests use real timers, which is also the more
  honest assertion — "no query yet" then means 250 ms of real time, not a statement about
  `advanceTimersByTime`.

---

## ADR-0019 — Phase 4 keeps two behaviours it was asked to question, and says so

**Date:** 2026-08-23 · **Status:** accepted; two product answers outstanding · **Phase:** 4

**Context.** ROADMAP.md Phase 4 does not ask for the Vs You tab to be built and left alone.
It asks for two inherited behaviours to be _confirmed or changed_ — the delta direction and
what an exact tie counts as — and for a not-found state that a deep link can actually reach.
Each of those turned out to be a fork.

**Decision 1 — the delta still reads `(theirs − mine) / mine`, and a tie still counts in
your favour.** Both are the prototype's, both are kept, and neither is a preference of this
implementation. The delta's direction means a _positive_ number is bad news, rendered in the
negative colour, which reads backwards at a glance. The tie rule means `mine >= theirs`
scores as a lead, so a mirror match reports "you lead in 5 of 5 stats".

Changing either is a one-line edit and a product decision. Making it silently, inside the
phase that was told to raise it, would be the worst of both — so instead each is asserted
by name (`counts an exact tie as YOUR lead, as the prototype does`), which means changing
one breaks a test that explains what it is protecting. **Both still want a design answer**,
and are listed in ROADMAP.md Phase 4 as unmet rather than ticked.

**Decision 2 — the viewer is LEFT joined, and `PlayerDetail.viewer` is nullable.**
`playerDetailQuery` inner-joined the viewer, so a roster with no viewer yet returned zero
rows for _every_ id — "no such player" and "no avatar yet" arrived as the same empty result.
The not-found state Phase 4 asks for would then have told a real player they did not exist,
half the time. Left joined, the two answers are different: a missing row is genuinely a
missing player, and a missing viewer renders the Stats tab in full with a Vs You tab that
explains it has nothing to compare against. Same shape as the roster's nullable hero card,
same cause (open decision 3).

**Decision 3 — back is `canGoBack() ? back() : replace('/')`.** A deep link has no history
behind it, so `back()` would leave the app from a control labelled "ROSTER". Android
predictive back is already enabled app-wide (`app.config.ts`, since Phase 0), and the button
has to agree with the gesture about where back goes or the animation and the tap disagree
in front of the user.

**Decision 4 — Reanimated is mocked in `__mocks__/react-native-reanimated.js`, by hand.**
The bars animate on the UI thread, which is what ROADMAP.md Phase 4 asks for and is the
right call on a screen that paints five of them at once behind a tab transition. Under jest
that costs a mock, and the library's own `react-native-reanimated/mock` cannot be used: it
imports the real entry point for its enums, reaches `react-native-worklets`, and dies
installing a Nitro native module Node does not have (`loadUnpackers` of undefined).

The replacement is ~60 lines in a root `__mocks__` module, picked up automatically with no
`jest.mock` call in any test. It resolves every animation instantly, so a test asserts where
a bar _ends up_ and never how it travels. That is the honest boundary: motion is a thing
only pixels can confirm, and confirming it is the Maestro gate's job (ARCHITECTURE.md §10),
not a mock's.

**Decision 5 — the selected tab is plain component state.** It survives backgrounding,
because Android keeps the process alive and nothing unmounts; it does not survive process
death, and it should not. A persisted "last tab" is per-player state that would outlive its
usefulness the moment you opened someone else — and `core/prefs` is a store for decisions
the user made about the app, not for where they happened to be looking.

**Consequences.**

- `.maestro/player-detail.yaml` exists and is registered in the screenshot harness, keyed on
  the seed's largest player. **It has never been run** — ADR-0017's emulator is still the
  blocker, and Phase 4's screenshot criterion is the second one in a row to depend on it.
  Two phases of visual promises are now stacked behind a gate nobody has executed.
- `usePlayerDetail` reads the whole screen from the single `observePlayer` observer, so the
  two tabs cannot disagree about which sync they are showing.
- Phase 5 owes this screen nothing new: the observer already returns `{ query, map }`, and
  the feature diff for the backend swap should stay empty here as well.

---

## ADR-0020 — Offline user data: the app writes players, and a sync may not take them

**Date:** 2026-08-23 · **Status:** accepted; two product answers outstanding · **Phase:** 4.5
(between the demoable milestone and the backend work)

**Context.** Everything through Phase 4 is read-only. The roster is whatever
`assets/seed.json` said, and the only way a row changes is a refresh that replaces the whole
ladder. The request is for the app to **manage user data locally now**, with an online
database taking over later, and specifically for the roster list to be able to add players.

That is not simply "add an INSERT". `replaceRoster` deletes every row on every sync, so a
naive add is a feature the next refresh silently destroys — and the app's first _write_ puts
pressure on three things a read-only design never had to answer: who owns a row, what `rank`
means for someone who has not played, and what happens when the server later learns about a
player this device invented.

**Decision 1 — a row has an `origin`, and it is `REMOTE` or `LOCAL`.** A new column, with a
migration (`0001_round_brood.sql`) defaulting to `REMOTE` so an already-seeded database
converts without inventing user data. `REMOTE` rows belong to whoever syncs the ladder;
`LOCAL` rows were entered here and nothing upstream knows about them.

`origin` is deliberately **not** a field on `Player`. A roster source produces players and
has no business declaring where they will be stored — so it travels on `RosterEntry` and
`PlayerDetail`, the two shapes that come back _out_ of the store. The practical consequence
is that `RosterSnapshot` did not change at all, which is what Phase 5 needs.

**Decision 2 — only `LOCAL` rows can be edited or removed.** Not a permissions model, an
honesty one: a synced row is overwritten by the next refresh, so an edit the app appeared to
accept would vanish without explanation. The detail screen therefore renders no edit control
for a synced player rather than a disabled one — an affordance that explains why it will not
work is still an affordance that does not work — and the repository refuses the write even
if something reaches it another way.

**Decision 3 — a sync keeps the local rows and re-seats them below the new ladder.**
`replaceRoster` reads the local rows out, replaces the remote ladder wholesale as before,
then writes them back renumbered from `snapshot.players.length + 1`. Both halves matter: a
sync that dropped them makes "add a player" a lie, and a sync that kept their old ranks
recreates the prototype's rank-12-in-a-14-player-roster inconsistency the moment the ladder
changes size. Where a snapshot claims an id a local row already holds, **the snapshot wins** —
upstream has caught up with that player, and two rows sharing one id is the only outcome
worse than losing the edit.

**Decision 4 — a new player joins at the bottom, and removing one closes the gap.** `rank` is
a _season standing_, and someone who has not played this season has not earned one; deriving
it from combat power would quietly redefine the column the roster header describes. Appending
also keeps the 1..N invariant a one-line consequence rather than a re-sort. Delete shifts only
the ranks below the removed one — one UPDATE that cannot read a value it is halfway through
rewriting, which a `SET rank = (SELECT count(*) …)` renumber does, silently and only on some
rows.

**Decision 5 — validation lives in `core/model`, not in the form.** `validatePlayerDraft` is
called by the screen _and_ by the repository before every write. A second entry point — a deep
link, a future import, Phase 5's sync — must not be able to store a row the form would have
refused, and a rule stated in two places is a rule that will disagree with itself. It is
hand-written rather than Zod because `core/model` imports nothing, and Zod belongs at the
network boundary where the input genuinely comes from elsewhere.

**Decision 6 — crit is entered in basis points, not as a percent.** Accepting "58.4127" means
parsing a decimal and scaling it, and a parse that rounds is exactly what ARCHITECTURE.md §2.2
refuses to let `toFixed` be — that contract covers _formatting_ only. Every number on the form
is therefore an integer, and the field renders the percent back as a live hint so nobody does
the arithmetic in their head. **This is the weakest part of the change and it is a known one:**
it is honest and it is not friendly. A percent field needs the §2.2 contract extended to
parsing, which is real work and is not smuggled in here.

**Decision 7 — the form is a third feature, `features/playerForm`.** Both the roster and the
detail screen link to it, and §4 forbids one feature importing another — so a form living in
either would be unreachable from the other. The boundary rule turning a naming question into a
structural one is what it is for.

**Consequences.**

- `rosterRepository` gained `createPlayer` / `updatePlayer` / `deletePlayer`, each returning
  `Result`. A rejection is a `PlayerDraftRejected` carrying **per-field** messages, so the form
  puts each one under its own input instead of dumping a sentence at the top. It is still an
  `Error`, so a caller that only reads `.message` keeps working.
- Duplicate names are refused case-insensitively, because the roster's own search is
  case-insensitive: two players the search cannot tell apart are two the user cannot either. It
  is a query rather than a unique index — uniqueness is a rule about what this device lets the
  user create, and a remote ladder shipping two players with one name is the server's business,
  not a reason to fail a migration.
- `core/design-system` gained `ArenaButton` and `FormField`. Until now every affordance was a
  bespoke `Pressable` wrapping an `ArenaText`, which was fine at two; this change adds six, half
  of them destructive or submitting. The two existing ad-hoc buttons (the roster's retry, the
  detail screen's back chevron) were **left alone** — converting them is a separate diff with
  its own screenshots.
- Routes: `player/new` (static, so it wins over `player/[id]`) and `player/edit/[id]`. The edit
  route is not `player/[id]/edit` because that would turn an already deep-linked,
  Maestro-referenced, twice-asserted file route into a directory for no behavioural gain. The
  cost of the static `new` segment is that a player whose id were literally `new` would be
  unreachable — which is why local ids are prefixed (`local-…`) rather than free-form.
- **A locally added player is announced, not drawn.** `RosterRowUi.isLocal` reaches the row's
  accessibility label and nothing else. The design has no badge for "you added this", and
  inventing one here would put a mark on the roster that never went past design review — but
  leaving a screen-reader user unable to tell an editable row from a fixed one would be worse.
  **This wants a design answer**, and it is the first of the two outstanding.
- **The second outstanding answer is what this feature is _for_.** Open decision 1 asks whether
  the backend exists; open decision 3 asks how "your avatar" is identified. Hand entry is a
  plausible answer to both — ARCHITECTURE.md §9.1 already lists "manual entry" as one of the
  shapes the data source might take — but nobody has said so. If it is the answer, local rows
  become the thing Phase 5 _pushes_ rather than the thing it works around, and the `origin`
  column is where that starts. If it is not, this is a convenience feature and Decision 3's
  preservation rule is the whole of its lifecycle.
- Phase 5 owes the form nothing new. The observers it reads are unchanged, and the sync path it
  writes through is the one `replaceRoster` already was.
- The Maestro flow for this screen is **not** written. Two phases of screenshot criteria are
  already stacked behind ADR-0017's absent emulator; adding a third unrun flow would be filing
  paperwork rather than testing anything. The form's states are asserted in
  `PlayerFormScreen.test.tsx` at 200 % font scale, which is what jest can honestly claim —
  clipping is still only a pixel question.

**Answers, 2026-08-24.** All three questions this ADR left open came back, and two of them
changed the code.

**Crit is a whole percentage, and it can exceed 100 %.** Decision 6 above is **superseded**.
Real values are 10, 113, 178 — so the `MAX_CRIT_BP` cap at 100 % was not a safeguard, it was
rejecting valid data, and it is gone. The remaining ceiling is `MAX_CRIT_PERCENT`, which is only
the 2^53 rule (§2.1) arriving through the x10 000 conversion.

The unit moved rather than the storage. `PlayerDraft` now carries `critPercent`; the column
still stores basis points, because §2.2's formatting contract and the seed's fractional values
both depend on it. The scaling happens once, in `core/db/write.ts`, **after** validation — and
that ordering is the whole point. Had the draft carried bp and the form multiplied, `1.5` would
have become `15000`: a perfectly valid basis-points value that no validator downstream could
have questioned. Keeping the draft in percent makes crit obey exactly the same rule as every
other stat — "a non-negative whole number" — and deletes Decision 6's special case instead of
documenting it.

It also disposes of the complaint Decision 6 made about itself: there is no decimal parse, so
there is no parse that rounds, so §2.2 does not need extending. The form asks for 113 and means 113.

**Manual entry is the data source, for now.** This answers the first of the two outstanding
product questions, and partly answers open decision 1. `LOCAL` rows are therefore not a
convenience feature working around the sync — they are the content. Two consequences follow:
Phase 5 needs a **push** direction it is not currently budgeted for (recorded in ROADMAP.md),
and the preservation rule in Decision 3 is now load-bearing rather than defensive.

**One thing this exposes, and it is unresolved.** The seed's 15 players are written as `REMOTE`,
so under the answer above they cannot be edited or removed — while every player the user
actually cares about can. That was coherent when the seed stood in for a real ladder; it is odd
now that nothing else is remote. The options are to leave them as demo data, to seed them as
`LOCAL` (which means `ensureSeeded` stops going through the snapshot path, since `replaceRoster`
stamps `REMOTE` by construction), or to drop the seed and start empty. It is a product call and
is deliberately **not** made here.

**"Who am I" gets its own screen, and only edits.** Open decision 3 stays open as a _product_
question, but its _shape_ is now decided: a screen like the add-player form, with no create and
no delete — you edit the viewer, you do not invent or remove them. Not built in this change.
What matters meanwhile is what it rules out: the add-player form must not grow a "this is me"
checkbox, because that would answer open decision 3 as a side effect of a different feature.
`preferences.setViewerId` still has exactly one caller, the sync.

---

## ADR-0021 — No seed. A new install starts empty.

**Date:** 2026-08-24 · **Status:** accepted · **Phase:** 4.5

**Context.** ADR-0020 flagged this and declined to decide it. Once manual entry became the
data source, the 15 players from `assets/seed.json` were the only rows in the database the
user could not touch — seeded rows are written `REMOTE`, and `REMOTE` rows are not editable by
design, because a sync would overwrite the edit. So the app shipped a roster where the first
15 entries were permanent and everything below them was not, with nothing on screen explaining
the difference.

**Decision. Delete the seed.** `assets/seed.json` and `localSeedRosterSource` are gone. A new
install runs its migrations, paints the empty roster, and waits for the user to add someone.

The seed was scaffolding and it did its job: Phases 1–4 were built, tested and demoed against
it before any backend existed, which is exactly what ARCHITECTURE.md §7 designed it for. It
stopped being scaffolding and started being furniture the moment the app could write its own
rows.

**What deliberately did _not_ change.** The `RosterSource` port stays in `core/common` with no
implementation, and `RosterRepositoryDeps.source` stays in the signature — optional. Phase 5
adds an argument rather than reintroducing a concept. Deleting the port along with its only
implementation would have been the tidier diff and the wrong one: it is the seam the entire
data layer is shaped around, and a repository that had to _grow_ one back is a repository
whose boundary has moved.

**Consequences.**

- `ensureSeeded()` is gone, and with it the third thing the splash screen used to wait for.
  Boot is now migrations and fonts. Screens may still assume the tables exist; they may no
  longer assume the tables have rows.
- **`refresh()` with no source returns `ok(undefined)`.** A no-op, not a failure. Nothing
  upstream exists and the roster is already showing everything there is — and in
  `RosterUiState` _any_ failure replaces the entire list, so reporting one would put a
  working, hand-filled roster behind "The ladder could not be read".
- The empty state stopped being an edge case and became the first screen of the product. Its
  copy changed accordingly: "pull the roster again once the season opens" described a pull
  that cannot happen.
- Both Maestro flows were rewritten, because both asserted seed data that will never exist
  again. `boot.yaml` now proves a first run paints a working empty state rather than the
  prototype's blank screen (defect 5). `player-detail.yaml` **enters its own subject through
  the add-player form** — with `atk 2,418,904,113`, the Int32 overflow the formatting contract
  exists for — because there is nobody to deep-link to on a fresh install. That makes it a
  longer flow covering more: add, save, detail, and the edit affordance in one pass. Neither
  has been run; ADR-0017's emulator is still the blocker.
- **The 1 000-row scroll budget (open decision 2) lost its fixture.** The seed supplied 15
  rows, which never exercised it either — but hand entry cannot supply 1 000, so that
  criterion now needs a deliberate load fixture rather than a bigger seed file.
- The `REMOTE` / `LOCAL` distinction currently has no `REMOTE` rows to describe. It is not
  dead code: it is what stops Phase 5's first sync silently eating the roster the user built
  in the meantime, which is precisely the failure ADR-0020 Decision 3 exists to prevent.

---

## ADR-0022 — You are a player you pick, and your stats are yours to update

**Date:** 2026-08-24 · **Status:** accepted · **Phase:** 4.6 (after 4.5, still before the backend)

**Context.** The request was small: _let me update my own stats — CP, ATK, DEF._ There was
nowhere to do it, and the reason turned out to be older than the request. `preferences.setViewerId`
had exactly one caller, the sync (ADR-0020), and there is no sync and no seed (ADR-0021). So on a
real install **nobody was the viewer**: the roster rendered with no hero card, the detail screen's
Vs You tab had nothing to compare against, and every one of those was a designed graceful
degradation quietly covering for a hole where identity should be.

ADR-0020 had already decided the _shape_ of the answer — "who am I" gets its own screen, edit-only,
no create and no delete — and had explicitly forbidden the add-player form from growing a "this is
me" checkbox. What it could not decide was where the viewer would come from, because at the time
only a server could name one.

**Decision 1 — the viewer is chosen from the rows that already exist.** `/me` lists the roster and
asks which player is you. It offers no name field: choosing is a _selection_, so answering "who am
I" cannot invent a player as a side effect — which is ADR-0020's "you do not invent or remove them"
enforced rather than restated. An empty roster is sent to the add-player form; the one creation path
in the app stays the one creation path.

**Decision 2 — `setViewerId` refuses an id that is not a row.** A stored viewer id pointing at
nothing renders a roster with no hero card and no explanation, which is the silent-empty failure
ADR-0021 spent a whole change removing. The repository checks and returns a `Result`; it does not
store a promise it cannot keep.

**Decision 3 — the viewer id becomes a subscription, not a render-time read.** Every observer
resolves the viewer at call time, so the id is part of each subscription's identity. Reading it with
`repository.getViewerId()` during render was correct while a sync was the only thing that could
change it — a sync rewrites the whole ladder, so something always re-rendered. Now the user changes
it from a screen pushed **over** the roster, and the roster below has nothing to re-render for.
`useViewerId` is a `useSyncExternalStore` over a listener set in `core/data`, and `useRoster`,
`usePlayerDetail` and `usePlayerForm` all read it that way.

It is `useSyncExternalStore` rather than a context value because the source of truth is MMKV: a
context would be a second copy of the id, and the two would disagree the first time a sync moved
one of them. The listener set lives in `core/data` rather than in `core/prefs` because it is
`core/data` that knows this id is a subscription key — `core/prefs` is a key-value store and stays
one.

**Decision 4 — the screen is a third _mode_ of the player form, not a fourth feature.** It is the
same eight fields, the same `validatePlayerDraft`, the same `updateLocalPlayer`. `PlayerFormMode`
gains `{ kind: 'viewer'; id }`, which is what makes "no delete" a fact about the type rather than a
condition in the screen — there is no delete control to hide, because `viewer` is not `edit`. A
fourth feature would have had to duplicate the field list and the string-to-draft parse, and
ARCHITECTURE.md §4 forbids it importing them from here, so the two copies would have drifted.

**Consequences.**

- **The roster carries one control with two labels**: "Who are you?" until an avatar is chosen,
  "Update my stats" afterwards. One control, because it is one errand — "the roster's idea of me is
  wrong" and "my numbers moved" are answered on the same screen. It sits beside the hero card rather
  than making the card pressable: the card is already read as three grouped facts, and turning it
  into a button would collapse those into one long label.
- **`/me` holds the choice as component state, not as a second route.** "Not you?" reopens the list
  in place. Routing it would put a page in the back stack whose only content is a list the user just
  left, and cancelling it returns to your stats rather than out to a roster you did not ask for.
- **Vs You starts working on a fresh install.** Nothing in `features/player` changed; it had been
  correct and unreachable since Phase 4, waiting for a viewer to exist.
- **Open decision 3 is answered for the offline app and still open for a backend.** "Which row is
  you on this device" is a preference. "Who are you to a server" is auth, and auth is still not
  budgeted. When a backend issues identities it supersedes the preference through one function.
- **Nothing about the `LOCAL`/`REMOTE` rule moved.** The viewer is edited through `updatePlayer`,
  which refuses a `REMOTE` row exactly as it did before — being your avatar does not make a synced
  row yours to rewrite, because the next refresh would still take the change.
- **No Maestro flow was written**, for the reason ADR-0020 gives and ADR-0017 caused: three phases
  of screenshot criteria are already stacked behind an absent emulator, and a fourth unrun flow is
  paperwork. The states are asserted in `ViewerScreen.test.tsx` at 200 % font scale, which is what
  jest can honestly claim.

---

## ADR-0023 — A player gains HP, a level and a game code

**Date:** 2026-08-25 · **Status:** accepted · **Phase:** 4.7 (with ADR-0024, still before the backend)

**Context.** ADR-0024 makes the game's own profile screen an input to the player form. That screen
shows nine things: a level, a name, an account code, CP, and six stats — HP, ATK, DEF, CRI, HIT,
SPD. The app's `Player` held six of the nine. HP, the level and the code had nowhere to go, and
`score` — which the app does hold — is on no screen the game paints.

The cheap answer was to scan only the fields that already existed and drop the other three on the
floor. It was rejected: an import that silently discards a third of what it reads is worse than no
import, because the loss is invisible. The user is looking at a picture with HP on it and a form
without, and nothing tells them which one is the app's opinion.

**Decision 1 — HP is a stat, and joins `STAT_KEYS` at the front.** It is a raw count like ATK and
SPD, so it needs no new formatting rule and no new column type: the detail screen's stat rows and
the Vs You comparison bars both pick it up from `STAT_KEYS` with no change. It goes first because
that is where the game's panel puts it, and a stat book that ordered its rows differently from the
screen it was copied off would make every check a hunt.

The visible consequence is that the Vs You verdict now reads "you lead in _n_ of **6** stats". That
is asserted rather than left to drift — ADR-0019's rule about inherited behaviour applies to derived
behaviour too.

**Decision 2 — the level and the game code are on `Player`, and neither is a stat.** They are
identity, not power: nothing sorts by them, nothing compares them, and neither appears in a
`CompareBar`. They render as one subtitle under the name on the detail screen — `LV. 488 · #a984` —
because that is how they are read, together and at a glance.

**Decision 3 — the game code is not an identity.** `PlayerId` stays server-issued and opaque
(`core/model`). Adopting the code as a key would make a mis-scan indistinguishable from a merge: two
players whose codes were misread as one would silently become one row, and the app would have no way
to notice. The code is stored, displayed, and otherwise inert.

It is stored **without** the sigil, lower-cased, by `normaliseGameCode`. That character is
punctuation the game paints, so a code typed by hand and one read off a screen are one value;
`gameCodeLabel` puts it back for display. An empty code is legal — a player entered from memory may
genuinely not have one — but a code that is present and malformed is refused, because that is the
shape a mis-scan produces.

**Decision 4 — `score` stays, and stays hand-typed.** It is not on the profile screen, so the
scanner never supplies it and never will: `ScannedField` excludes it at the type level. The form
field says so in its hint rather than leaving the user to wonder why one box stayed empty.

**Consequences.**

- **Migration `0002_player_profile.sql` adds three columns**, all with defaults: `level` 0,
  `game_code` empty, `hp` 0. Defaults rather than a backfill, for the reason `origin` gives in
  ADR-0020 — the migration must not invent user data for rows written before the field existed.
- **Level 0 renders as nothing.** `identityLabel` omits a zero level rather than printing `LV. 0`,
  because on an upgraded database zero means "nobody recorded one", not "a new account".
- **The form is eleven fields deep.** It is still a `ScrollView` and not a recycler, for the reason
  `PlayerFormScreen`'s header already gives: a recycled `TextInput` drops the keyboard mid-word.
- **Every `Player` fixture in the test suite changed.** That is the cost of widening a domain type
  and it was paid in one pass; nothing was defaulted in a helper to avoid it, because a fixture that
  quietly fills in HP is a fixture that cannot test HP.

---

## ADR-0024 — Stats can be read off a screenshot, and the scan never saves

**Date:** 2026-08-25 · **Status:** accepted · **Phase:** 4.7 (with ADR-0023)

**Context.** Typing a player in by hand means copying eleven fields off a game screen, several of
them ten digits long, with no way to catch a transcription error except reading it twice. The
request was to fill the form from a screenshot instead.

**Decision 1 — on-device OCR, and no network at all.**
`@infinitered/react-native-mlkit-text-recognition` runs ML Kit locally. A cloud OCR service was not
considered for long: a screenshot of a profile carries a player's name and account code, there is no
backend in this app to send it to (open decision 1), and adding one for this would mean writing a
privacy policy for a stat book. The package is an Expo module rather than a legacy native module,
which is what makes it safe on RN 0.86's New Architecture — the older and more popular
`@react-native-ml-kit/text-recognition` is bridge-era and was rejected for that reason.

**Decision 2 — the parser is pure, and lives in `core/ocr`.** `parseStatSheet` takes recognised
lines with their rectangles and returns a partial `PlayerDraft`. It imports nothing but `core/model`
and `core/common`, so the whole of the difficult behaviour is provable in the Node test project
against recorded text — no emulator, no photo library, no ML Kit. A new `core/*` element rather than
a folder under `features/playerForm`, because a feature imports React and a parser that lived behind
one would be unreachable from the fast test project.

`core/ocr` may **not** reach `core/data`. A module that could write would make "scanned" and "saved"
the same act, which Decision 5 exists to prevent. The rule is a boundary policy with a probe in
`scripts/check-boundaries.mjs`, per ADR-0016.

**Decision 3 — two ports, not one.** `ImageSource` and `TextRecogniser` are separate because they
fail for different reasons and the user has to be told which: "you did not grant access to your
photos" and "there was no readable text in that picture" have different fixes, and one port would
have flattened them into a shrug. Cancelling the picker is a **value**, not an error — it is the
most common thing that happens after opening a picker by accident, and reporting it as a failure
would put a red message on screen for a decision the user already made.

**Decision 4 — nothing is repaired.** A token becomes a stat only when, after group separators and a
trailing percent sign are removed, every remaining character is a digit. There is no letter-to-digit
rescue. A repair turns an unreadable value into a plausible wrong one, and the user cannot tell the
difference by looking at the form — whereas a field the scan left alone is visibly empty. Stripping
dots and commas from a digit run is safe only because every stat is a whole number: there is no
fractional stat for a decimal point to belong to, so a dotted eleven-digit run can only be one
integer.

**Decision 5 — a scan is a suggestion.** It writes into the form's inputs and stops. The user reads
them and presses Save, and the same `validatePlayerDraft` that guards a hand-typed player guards a
scanned one. Nothing about the write path changed.

**Decision 6 — the stat panel is the anchor.** The screenshot this was built from has **two** combat
powers on it: the profile dialog's, and the viewer's own on the roster behind it, half-covered.
Reading order picks the wrong one depending on how the recogniser walks the image. So the six stat
labels are located first, their bounding box becomes an anchor, and the CP and level nearest to it
win. The game code is read only from the header row for the same reason — elsewhere on that screen
the sigil prefixes a build number, and a scan that adopted it as a player's code would be wrong in a
field nobody thinks to check.

Both distractors are in the test fixture on purpose. Cropped to the dialog, it would pass without
either rule existing.

**Consequences.**

- **A partial scan is a success, and says what it missed** — naming the gaps rather than celebrating
  the hits, because a scan that quietly dropped SPD looks identical to a complete one. Zero fields
  is the one case reported as a failure: an empty success would leave the form untouched and the
  user unable to tell whether anything ran.
- **A scan merges; it does not replace.** A screenshot that gave up everything but the name leaves
  the name the user already typed alone. `score` is never in the result at all.
- **`allowsEditing` is off in the picker.** A crop dialog would let the user remove the header that
  the anchor in Decision 6 depends on.
- **Two root `__mocks__` entries were added**, for `expo-image-picker` and the ML Kit module, so a
  feature test can import `@/core/ocr` without a native module. Neither recognises anything: what a
  screenshot parses into is proven in `statSheet.test.ts`, not by a mock pretending an engine ran.
- **A native rebuild is required.** Both packages are native, so `expo run:android` must run before
  the scan control does anything on device. Nothing in the JS-only suite catches a failure there,
  which is one more thing the absent emulator gate (ADR-0017) would have caught.

---

## ADR-0025 — Thousands are separated by a dot, decimals by a comma

**Date:** 2026-08-25 · **Status:** accepted · **Phase:** 4.7

**Context.** Every number in the app was rendered `2,418,904,113`. The game it reads from renders the
same kind of number `11.724.329.467`. Checking one against the other meant re-reading a twelve-digit
value in two different notations, which is exactly the work the "show every stat twice" contract
exists to remove — and ADR-0024 made the mismatch worse by putting the game's own screenshot
directly into the form.

**Decision 1 — the separators are stated, not derived from a locale name.** `createStatFormatter`
takes them as an argument, defaulting to `DOT_SEPARATORS`. Switching the pinned locale from `en-US`
to `it-IT` would have been the one-word version and it is not the same thing: what a locale gives
back depends on the ICU data compiled into a particular Hermes build, and a build missing the
requested locale does **not** throw — it silently formats under a default one. That failure used to
be invisible; now it would put commas on a screen the rest of the app spells with dots.

The locale argument stays, because it still decides _where_ the groups fall — that is the one thing
`Intl` knows and a hand-rolled grouper does not, for the locales that do not group in threes. But
`Intl` is used only when its own grouping character matches the one this app chose. Otherwise the
hand-rolled grouper takes over, and the output is the same on CI, on a device with full ICU data,
and on one without.

**Decision 2 — the decimal separator moves to a comma with it.** This was not asked for and is not
optional: `short(n, 'MILLIONS')` groups its thousands and `short(n, 'BILLIONS')` prints two
decimals, so `2.419 M` and `2.42 B` can appear on the same screen. One glyph meaning both would make
those two unreadable against each other. The pair is coherent or it is broken; there is no third
option.

So crit reads `71,2043 %`, a delta reads `+104,2%`, and combat power reads `3,08 M` — while
`2.418.904.113` and `2.419 M` keep the dot for what it now exclusively means.

**Decision 3 — the form reads a separator as grouping only when three digits follow it.**
`parseStat` used to strip every comma and space. Extending that to dots was the obvious move and it
is wrong in a way nobody would catch: `1.5` would arrive as `15`, a perfectly valid stat that
`validatePlayerDraft` has no reason to reject, and the box would look right. Requiring the run of
three keeps a mistyped decimal a _visible_ rejection — `1.5` parses as 1.5 and the field says "enter
a whole number" — while `2.418.904.113`, which is what the roster displays and therefore what gets
pasted back into it, is read as the integer it is.

Both punctuation marks are accepted on input, not just the app's own. A number copied out of
somewhere else is still a number the user means, and being strict about its punctuation would refuse
data for a reason that is about the app rather than about the value.

**Consequences.**

- **Open decision 9 is narrower than it was.** The old `parseStat` comment said stripping commas was
  safe "only while the app is English-only", because in a comma-decimal locale it would turn 1,5
  into 15. The three-digit rule removes that hazard for both characters, so the app's display
  language and its number punctuation are now independent choices.
- **The scanner was already indifferent.** `core/ocr` strips dots, commas, apostrophes and thin
  spaces from a digit run and always did, for the reason ADR-0024 gives: there is no fractional stat
  for a decimal point to belong to, so a dotted run can only be one integer.
- **One test asserts the opposite convention on purpose.** `createStatFormatter('it-IT', { group:
',', decimal: '.' })` is exercised, because separators being a parameter rather than a consequence
  of the locale name is the whole of Decision 1 and would otherwise go untested.
- **No migration, and nothing stored changed.** Punctuation is a rendering decision; the columns hold
  integers and basis points exactly as they did.
