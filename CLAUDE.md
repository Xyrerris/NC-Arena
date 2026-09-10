# Working in this repository

## Branches

**Every point of Phase 4.10 goes on `close-the-gaps-before-the-backend`.** One branch for the whole
phase, not one per point.

The phase is a single defect sweep with a single exit gate — Phase 5 does not start until _all_ of
4.10's criteria are met (ROADMAP.md) — so its points are not independently shippable and splitting
them across branches buys nothing. What it costs is real: each point builds on the one before
(4.10.3's restore had to know what 4.10.2 decided about records, and 4.10.4's `deletePlayer` fix
reuses the `clearViewerId` 4.10.3 added), so a per-point branch either forks from a stale base or
spends its first commits catching up.

If your session instructions name a different branch — a per-task name like
`claude/punto-4-10-4-<id>` — that instruction and this file disagree. Say so and ask before you
push; do not silently pick one. The per-task name is generated outside this repository, so this
file cannot override it, only make the conflict visible.

Work outside Phase 4.10 is not covered by this rule. Branch as the task warrants.

## Before you push

`npm run verify` — typecheck, lint, the two architectural gates, Prettier, both Jest projects. It is
the same thing CI runs, so a green local run is the only reason to believe a push will be green.

The two gates under `check:rules` are not ordinary lint. They write deliberate violations and fail
if those _pass_, because a misconfigured rule reports zero violations and looks exactly like a
compliant codebase — which is what happened for two phases (ADR-0006). Treat a change to
`eslint.config.js` or to either script as a change that needs its own probe.

## Read first

| Doc                                          | What it decides                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, module boundaries (§4), the data layer (§7), the testing split (§10) |
| [docs/DECISIONS.md](docs/DECISIONS.md)       | Every ADR. The _why_ behind anything that looks arbitrary                   |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | Phases, exit criteria, and what is deliberately still open (marked ⚠️)      |

ARCHITECTURE.md first; the roadmap references its section numbers throughout.

## Two conventions that are easy to break by accident

- **The test-project split is by extension, not by folder.** `.test.ts` runs in the fast Node
  project and may not import `react-native`; `.test.tsx` runs under jest-expo. See `jest.config.js`.
- **A feature may not import another feature**, or `core/db`, or `core/network` — enforced by
  `eslint-plugin-boundaries`. Where two features have to meet, the **route** composes them: that is
  what `src/app/me.tsx` does with `playerForm` and `rosterBackup`.
