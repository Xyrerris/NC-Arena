# Handoff — UI/UX redesign, end of day 1

**As of 2026-11-19.** Branch `feature/application-design-restyle`. This file is the map for tomorrow;
the reasoning is in the checkpoint documents next to it. Read `MASTER_PROMPT.md` first (the process and the
rules), then this.

## Where we are

Checkpoints 1–4 are done and approved. **No application code has changed for the redesign yet** — the only code
change is the FlashList fix below. Checkpoint 5 (design system, `CHECKPOINT_5.md`) is approved with all 11 decisions. Next is **Checkpoint 6: screen mockups**. Before the form screens: the census of helper texts hidden until focus (CHECKPOINT_5 §7, item 8).

| Checkpoint            | Document                                                               | Status                              |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| 1 Repository analysis | `CHECKPOINT_1.md`                                                      | approved                            |
| 2 UI/UX audit         | `CHECKPOINT_2_AUDIT.md`                                                | approved                            |
| 3 Three directions    | `CHECKPOINT_3.md`, `mockups/directions.html`                           | approved: hybrid B+A                |
| 4 Decisions           | `CHECKPOINT_4.md`, `PROPOSAL_bottom_bar.md`, `mockups/bottom-bar.html` | approved, incl. bottom bar Option 1 |
| 5 Design system       | `CHECKPOINT_5.md`                                                      | approved (1–11)                     |

## Decisions already made (do not reopen without the owner)

1. **Direction: hybrid B+A.** Deep green-black, ivory text, mint accent; Cinzel only for the wordmark, screen
   titles and rank numerals; mono numerals; hairline lists instead of cards; one filled action per screen;
   quiet underlined tabs; large title that scrolls with the list. Dark **and** light themes (light paper
   `#f1eee6` from B, neutral A lists).
2. **Fonts: keep the bundled trio** (Barlow, Cinzel, JetBrains Mono). No new font file, no download. Only bundled
   weights: Cinzel 500/700, Barlow 400–700, JetBrains Mono 400/500.
3. **Icons: `react-native-svg` approved**, SDK-listed 15.15.4, installed with `npx expo install react-native-svg`
   (ADR-0003), in the first implementation group (one native rebuild of the dev client and EAS).
4. **Bottom bar: Option 1** — docked, not floating, same `router.replace`, no route moves, hidden on pushed
   screens, `animation: 'none'` on the three section routes, hidden while the keyboard is open, 200 % checked on
   the device.
5. **AA contrast stays the floor** (owner delegated it). All six themes in the mockup measure ≥ 4.61:1; the
   per-theme palette goes into `tokens.ts` with the contrast table redone for light surfaces.
6. **Flow changes (F) need the owner's approval each time**: filters in a sheet, prose into info sheets,
   "Read again" in a toolbar, tappable viewer card, helper text only on focus, sticky Save.

## Rules of the process (from `MASTER_PROMPT.md`)

- The advisor (`/advisor claude-fable-5-2`) **must** be consulted before presenting Checkpoints 5, 7 and 10,
  before any irreversible style choice and before closing each group of screens. Report it in a section
  "Parere di Fable (advisor)", only if it really answered; it has rejected drafts twice, expect that.
- No implementation before the mockups are approved (Checkpoint 7). No commit or push without the owner saying so.
- Do not touch backend, database, API contracts, logic or behaviour; new dependencies only with the owner's OK.

## What Checkpoint 5 must contain

The design system, as a document plus the token plan (no code yet): colour (both themes), typography on the
bundled fonts, spacing, radius, component library (buttons, icon buttons, inputs, tabs, chips, list rows,
inset groups, sheets, dialogs, toast, empty / error / loading), interaction states, and the React Native
specifics (tokens in `core/design-system`, the lint rules that ban raw colours and spacing, test impact).

Requirements that came out of the work and must be in it:

- **Roster row at 200 % font scale:** rank column sized in `em`; above a scale the row stacks — name, exact CP,
  rounded value on its own line, points below. Exact **and** rounded values always visible and unclipped
  (the Maestro `player-detail.yaml` gate asserts them).
- **Large collapsing title** needs the header inside the list (also what the audit asked for).
- Check Cinzel's digits are tabular; otherwise right-align or fix the width of the rank cell.
- **Known test impact:** moving the "exact value left · rounded value right" caption breaks
  `player-detail.yaml`; `SectionTabs.test.tsx` and the section screens' tests pin the current control.
- `userInterfaceStyle` in `app.config.ts` must change from `'dark'` for the light theme (documented build-config
  change, MASTER_PROMPT §4 rule 11).
- The text-token alpha clamp in `tokens.ts` (open decision 5) is replaced by per-theme solid values.

## Facts worth knowing

- **The roster-list bug is fixed.** `@shopify/flash-list` is pinned at 2.3.2 (`cdebe44`) and
  `expo.install.exclude` stops `expo install --fix` and `expo-doctor` from putting 2.0.2 back; DECISIONS.md has
  the note. With 2.0.2 on RN 0.86 the top rows are never drawn. Verified on the emulator and, by the owner on
  2026-11-20, on the physical device. PR [#7](https://github.com/Xyrerris/NC-Arena/pull/7) puts it on `main`.
- **Dev setup used today:** emulator `Galaxy_S22_Ultra` (1440x3088, density 560), `npx expo start --dev-client`
  on port 8081 plus `adb reverse tcp:8081 tcp:8081`. A Metro process may still be running on this machine.
  Deep links work: `arenascout://me`, `/upgrade`, `/collection`, `/player/new`, `/account`, `/catalogue`.
  The emulator's app is paired to the live backend with real data; do not create accounts or save anything.
- **Not seen yet:** `ViewerChoiceScreen`, the four sheets (Market, Offer, Planner, Batch), the open filter panel,
  Vs You, the recovery-code state of the account gate, anything at 200 % font or in a light theme on the device.
- `npm run verify` was green on the fix (tests 1462 + 1089, coverage 96.85 %, backend 46). `prettier --check`
  covers `docs/`, so every new markdown / HTML here must be run through `prettier --write` (done for all).
- Mockups are plain HTML opened in a browser; they are design references, not React Native.

## Open items

- List fix confirmed on the physical device (2026-11-20); the 200 % bar is still to check.
- PR #7 (`fix/roster-flashlist-2.3.2` → `main`) is open; merging it is the owner's call.
- Hooks in this environment ask for a short "facts" statement before creating or editing files; give it, retry.
