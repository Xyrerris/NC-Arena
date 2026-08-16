# NC-Arena — Arena Scout (React Native)

A stat book for the arena: browse the registered roster, open any player to read their raw combat
values, and flip to **Vs You** to see where your avatar stands and how the head-to-head has gone.

**Current state: planning. No application code exists yet.**

## Documents

| Doc                                          | What it covers                                                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Infrastructure proposal — React Native stack, project structure, domain model, formatting contract, data layer, testing, CI, and the open decisions that still need answers |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | Phased delivery plan with exit criteria, the defect backlog inherited from the prototype, and the risk register                                                             |

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

To view the prototype, open `design/Arena Scout.dc.html` in a browser.

## Before writing code

Phase 0 of the roadmap is blocked on three answers — is there a backend, how large is a real
roster, and are the accessibility contrast changes approved. See
[ARCHITECTURE.md §9](docs/ARCHITECTURE.md) for the full list.

Two of those decisions are new to the React Native plan and do not block Phase 0, but do have
deadlines: **iOS in or out** (§9.6 — Android-only is what the roadmap costs; iOS is +6 to +8 days
and must be answered by Phase 6) and **OTA update governance** (§9.10 — required before the first
external build).
