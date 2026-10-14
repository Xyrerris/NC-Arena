# Working in this repository

## Branches

**There is no single mandatory branch any more.** The main backend work is done, so the standing
instruction of 2026-09-21 (all work on `claude/backend-data-management-w98hph`) is lifted
(owner, 2026-10-14). Branch as the task warrants.

One thing to know: Coolify deploys the backend automatically from
`claude/backend-data-management-w98hph`, so a push to that branch that touches `backend/` is a
deploy, migrations included. Don't push there by accident.

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
| [docs/HANDOFF.md](docs/HANDOFF.md)           | Where Phase 5 stopped, what is decided, and what to pick up next            |

ARCHITECTURE.md first; the roadmap references its section numbers throughout. HANDOFF.md is the
short one — read it before you plan anything, because it says which decisions are already made.

## Two conventions that are easy to break by accident

- **The test-project split is by extension, not by folder.** `.test.ts` runs in the fast Node
  project and may not import `react-native`; `.test.tsx` runs under jest-expo. See `jest.config.js`.
- **A feature may not import another feature**, or `core/db`, or `core/network` — enforced by
  `eslint-plugin-boundaries`. Where two features have to meet, the **route** composes them: that is
  what `src/app/me.tsx` does with `playerForm` and `rosterBackup`.
