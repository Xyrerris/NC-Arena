# Checkpoint 2 — UI/UX audit

2026-11-19. Read-only; no application file touched. Evidence: fresh captures from the Galaxy S22 Ultra
emulator (1440x3088, dev build, real paired account) of Arena, Collection (Offers), Upgrade, `/me` (top and
footer), `/player/new`, `/account`, `/catalogue`; code reading; the 2026-10-01 device screenshots in
`docs/ArenaScoutResults` for roster rows and player detail. `CHECKPOINT_1.md` is a condensed English version
of the report given in chat (English matches the repository's language).

## What could not be verified

1. **The roster list renders no rows in the dev build.** The header says "40 registered players", the list
   container exists and is empty, also after a JS reload and a sort change; logcat shows no JS warning
   explaining it. Cause unknown (dev-build/FlashList quirk or a real defect). Under the no-logic-changes rule
   I cannot fix it; roster rows and player detail are therefore judged from the 01/10 release screenshots.
   **Decision for the owner:** investigate it as a separate task?
2. Not seen: `ViewerChoiceScreen`, the four sheets (Market, Offer, Planner, Batch), the open filter panel,
   Vs You, a populated Collection / Items list, the recovery-code state of the account gate.
3. Not exercised: 200 % font scale and any light theme.

### Roster list investigation (owner asked, read-only)

Observed on the emulator dev build, 2026-11-19, no code changed:

- `uiautomator` shows the `roster-list` container (1440 x 1059 px) present; across cold starts, a JS reload,
  a sort change and scrolling, it contains **either no row or a single row at the very bottom edge** (rank 34,
  "JillyBean", y = 2830–3088) — never the top of the ladder. The header (40 players, viewer rank 3) is correct,
  so the data is there and the screen is in the `ready` state.
- No JS warning or error in logcat explains it; `RosterScreen.tsx` renders a plain `FlashList` with an
  `extraData`, `refreshing` and `ListEmptyComponent`, nothing unusual.
- Other `FlashList` screens render rows in the same build (the Offers list showed a row, form screens work), and
  the 2026-10-01 release screenshots on a physical device show the list correctly.
- What changed since 2026-10-01: SDK 57 patch bumps (2026-11-13), the Upgrade merge, React Compiler on since
  the scaffold. The app under test is a **dev** build on an **x86_64 emulator**.

Hypotheses, most likely first: (1) FlashList 2.0.2 virtualisation / measurement misbehaving on the emulator
or in dev mode (rows laid out outside the viewport); (2) an interaction with React Compiler memoising the
`renderItem` or `extraData`; (3) a regression from the 2026-11-13 dependency bump. **Not established.**

Next step, needs code and therefore the owner's go-ahead: run the release/EAS build on the physical device (is
it broken there too?); if yes, bisect with the 2026-11-13 commit and try `FlatList` on a scratch branch.

## Cross-cutting findings

1. **One visual idiom for everything.** Tab selector, filter chips, sort chips, primary and secondary buttons,
   text fields are all pills; primary vs secondary differ only by fill, so hierarchy rests on one green.
2. **Chrome eats the first screen.** Roster: section tabs, title, sync line, count, add button, viewer card,
   "Update my stats", search and sort chips take ≈ 65 % of the screen and sit outside the list, so they never
   scroll away.
3. **Uppercase, tracked, small labels everywhere** (YOUR AVATAR, COMBAT POWER, NAME, LEVEL, all buttons and
   chips): reads as a console.
4. **No icons.** Back is "← ROSTER", add is "+ NEW PLAYER", on pushed screens Cancel / Not you? / Edit are
   floating pills under the status bar with no title bar.
5. **Prose carries the UI.** Upgrade and Collection explain the engineering in paragraphs; useful but
   undifferentiated, and red/green body-size notices read as content, not status.
6. **Chip groups wrap into stacked blocks** (Upgrade: five rows before any result).
7. **Inconsistent gutters.** On `/me` the footer cards (avatar, keystore) are inset ≈ 50 px further than the
   form fields above them; sections are cards inside a form page.
8. **Several large primary pills on one screen** (`/me`: SAVE MY STATS, SAVE AVATAR, TEST PASSPHRASE, REMOVE
   KEYSTORE are all full-width pills), so no action reads as the one that matters.
9. **Brand typography used inconsistently**, not wrongly: Cinzel appears on the player name only; the green
   accent and mono numerals are the identity. Keep-or-replace is a Checkpoint 3 decision (see advisor review).
10. **The catalogue shows component class names as section titles** (VIEWERCARD, FORMFIELD, ARENABUTTON): a
    debug page, but it is also the base for the future gallery.
11. **Strengths to keep.** Monospaced numerics with exact + rounded values, 48 dp targets, AA contrast, token
    system, behavioural tests, a coherent dark palette.

## Per-screen table

Type: **V** = visual only, no behaviour change; **F** = changes a flow or content, needs the owner's approval
(MASTER_PROMPT §4) and is therefore a separate proposal.

| Screen                                           | Problem                                                                                                                               | Proposed intervention                                                                                                 | Type                                                                                                  | Priority |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Roster (`/`)                                     | Fixed header ≈ 65 % of the screen, five stacked control groups; list squeezed (and blank in dev, see above)                           | Large title that collapses; header inside the list so it scrolls; viewer card made compact; search + sort on one band | V (scroll-with-list is layout)                                                                        | High     |
| Roster row                                       | Rank, name, CP, points, record all text in a row; swipe-record has no undo (known, ROADMAP)                                           | Quieter row hierarchy: rank numeral, name + secondary, trailing CP (exact + rounded kept)                             | V                                                                                                     | High     |
| Player form (`/player/new`, edit, `/me` top)     | 11 stacked fields, uppercase label + box + helper under each; Cancel pill floating at the top; save is at the bottom of a long scroll | Sectioned form (identity / power / stats), tighter field rhythm, top bar with Cancel; save stays reachable            | V; sticky Save or helper-only-on-focus is **F**                                                       | High     |
| Collection + Offers                              | Title, progress, two status lines, tab pill, filter box, prose, three chip rows, READ AGAIN as a big pill                             | Compact progress header, status line as one styled row, calmer notice colours, chips in a single scroller             | V; filters-in-a-sheet, prose-to-info-sheet, READ AGAIN to a toolbar are **F**                         | High     |
| Upgrade                                          | Intro paragraph, two buttons, status chip, three wrapping chip groups before the empty state                                          | Same family of changes as Collection; real empty state                                                                | V; same **F** items                                                                                   | High     |
| Player detail                                    | Cinzel small-caps title; six same-weight bordered cards; caption "exact value left · rounded value right"; text back                  | One grouped list of stats, CP as hero, icon back / edit                                                               | V; moving the caption is a visible-content change and breaks `player-detail.yaml` (known test impact) | Medium   |
| Section tabs                                     | Large outlined three-pill control on top of every section                                                                             | Slimmer segmented control; a bottom tab bar is a flow change                                                          | V now; bottom bar **F**                                                                               | Medium   |
| `/me` footer (avatar, keystore, account, backup) | Cards inset differently from the form; four full-width pills                                                                          | Settings-style grouped sections aligned to the gutter; one primary per section                                        | V                                                                                                     | Medium   |
| Account gate / `/account`                        | Plain form, two stacked full-width pills, prose                                                                                       | Same form language; clearer hierarchy between Create and Continue offline                                             | V                                                                                                     | Medium   |
| Vs You                                           | Not captured                                                                                                                          | Treat with the detail group pattern at mockup stage                                                                   | V                                                                                                     | Medium   |
| Sheets (Market, Offer, Planner, Batch)           | Four separate `Modal`s with no shared chrome (code only)                                                                              | One `Sheet` component: grabber, title, close, sticky action                                                           | V                                                                                                     | Medium   |
| Empty / error / loading                          | Text only                                                                                                                             | EmptyState, ErrorState, list skeleton                                                                                 | V                                                                                                     | Medium   |
| BootFailure, not-found                           | Plain text                                                                                                                            | Use EmptyState                                                                                                        | V                                                                                                     | Low      |
| Catalogue                                        | Debug page                                                                                                                            | Becomes the design-system gallery                                                                                     | V                                                                                                     | Low      |

## Constraints that the owner's choices create

- **Light + dark** needs `userInterfaceStyle` changed from `'dark'` in `app.config.ts`, a build-config change that
  MASTER_PROMPT §4 rule 11 requires to be documented with a reason; and the AA contrast table in `tokens.ts`
  has to be recomputed for light surfaces.
- **Product invariant:** exact and rounded values stay visible and unclipped at 200 % font scale (Maestro gate).
  Any new row, including the compact viewer row, must keep both.
- **Dev environment:** Metro was started in the background for the captures and is still running.

## Parere di Fable (advisor)

Fable was consulted through the `advisor` tool and answered. Its points and how each was handled:

1. _Captures never looked at; detail screens claimed but not real._ **Accepted.** The five screens were read and
   the table updated; the "detail" captures were the roster (the tap hit the empty list) and are not cited.
2. _"Viewer card duplicates Update my stats" is wrong, only `roster-viewer` navigates._ **Accepted.** Claim removed;
   making the card tappable is not proposed as a visual change.
3. _The empty roster is the headline._ **Accepted.** Moved to the top; logcat checked once, no explanation found;
   handed to the owner as a decision.
4. _Too many High (9 of 15)._ **Accepted.** High is now roster, roster row, forms, Collection/Offers, Upgrade.
5. _Separate visual from flow changes._ **Accepted.** Added the V / F column; every F item waits for approval.
6. _Product invariants missing._ **Accepted.** Added exact + rounded at 200 % and the `player-detail.yaml` impact.
7. _Cinzel and the green are brand, not defects._ **Accepted.** Reframed as inconsistent usage; decided at Checkpoint 3.
8. _Both themes imply a build-config and contrast change._ **Accepted.** Listed above.
9. _Minor:_ CHECKPOINT_1 language note and Metro still running — both stated above.

Judgement from Fable's side: the draft was sound; what needed correction was evidence discipline, priority
inflation and the blurred line between visual and flow changes.
