# NC-Arena — Arena Scout (React Native)

A stat book for the arena: browse the registered roster, open any player to read their raw combat
values, and flip to **Vs You** to see where your avatar stands and how the head-to-head has gone.

**Current state: an Android app that runs, filled in by hand and stored only on the device.** You
add players yourself — typing them in, or reading their stats off a screenshot of the game — say
which one is you, and record a match by swiping their row. Everything lives in SQLite on the phone,
and can be exported to a file and imported back.

**Not there yet: the backend, and the visual gate.** There is no server and no sync, so a roster
exists on one device and travels only through the export. And the Maestro screenshot run needs an
emulator nobody has stood up (ADR-0017), so four phases of visual promises are still unverified —
including the 200 % font-scale criterion the app is designed around.

That paragraph is the state of the thing, not a changelog. Keep it that way: when it stops being
true, rewrite it rather than appending to it.

## Getting it running

Android only, by decision (ARCHITECTURE.md §9.6 costs iOS; nothing has bought it yet).

```
npm ci
npm run android      # boots the Galaxy S22 Ultra AVD, then expo run:android
npm run verify       # what CI runs: typecheck, lint, the rule probes, format, tests, coverage
```

`npm run verify` before every push. It is the same thing CI runs, so a green local run is the only
reason to believe a push will be green.

## Documents

| Doc                                          | What it covers                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The stack, project structure, domain model, formatting contract, data layer, testing strategy, CI, and the open decisions that still need answers                        |
| [docs/DECISIONS.md](docs/DECISIONS.md)       | Every ADR — the _why_ behind anything in the code that looks arbitrary                                                                                                   |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | Phased delivery plan with exit criteria, what each phase deliberately did **not** do (marked ⚠️), the defect backlog inherited from the prototype, and the risk register |
| [CLAUDE.md](CLAUDE.md)                       | Working conventions: which branch, what to run before pushing, the two rules easiest to break by accident                                                                |

Read ARCHITECTURE.md first; the roadmap references its section numbers throughout.

## `design/`

The Claude Design prototype, imported 2026-08-13 from
[project 36ab1c0a](https://claude.ai/design/p/36ab1c0a-2f4b-4ee1-bf2c-d4dd079ce722). Treat it as
the UI source of truth — but note what is and is not product:

| File                  | Role                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Arena Scout.dc.html` | **The spec.** Both screens, all layout and behaviour, plus a 14-player synthetic seed dataset                                                                                                                   |
| `ios-frame.jsx`       | Prototype device chrome (iOS status bar, dynamic island, keyboard). **Not ported** — it is a photo backdrop, not a component library, and the app uses the real system UI. Being React does not make it product |
| `support.js`          | Generated Claude Design runtime that interprets the `<x-dc>` template dialect. Not a dependency of the app                                                                                                      |

The prototype's 14-player dataset is **not** the app's. A new install starts empty (ADR-0021). To
view the prototype, open `design/Arena Scout.dc.html` in a browser.

## Still open

The full list is [ARCHITECTURE.md §9](docs/ARCHITECTURE.md). The three that shape what happens next:

- **Is there a backend?** (§9, decision 1) Phase 5 is the sync, and it cannot start without an
  answer. Manual entry is confirmed as the data source for now (ADR-0020).
- **iOS in or out?** (§9.6) Android-only is what the roadmap costs; iOS is +6 to +8 days, and the
  answer is due by Phase 6.
- **OTA update governance** (§9.10) — required before the first external build.
