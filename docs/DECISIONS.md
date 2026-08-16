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
| 7   | Does `shortUnit` become user-facing?                                     | Phase 2            |
| 8   | Season semantics — is "SEASON 41" dynamic?                               | Phase 3            |
| 9   | Localisation scope                                                       | Phase 6            |
| 10  | OTA update governance                                                    | Phase 7            |

Decisions 1, 2 and 5 are the Phase 0 exit criteria. 5 is the urgent one: Phase 1 builds the
token module, and answering it afterwards means rebuilding every component that consumed a
token.
