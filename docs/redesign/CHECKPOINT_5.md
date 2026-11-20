# Checkpoint 5 — Design system (approved 2026-11-20)

**2026-11-20.** Direction fixed by Checkpoint 4: hybrid B + A, bundled fonts, `react-native-svg` for icons, docked
bottom bar. This is the design system as a document and a token plan. **No code changes.** Every number below is
either measured (contrast, WCAG 2.x relative luminance) or taken from a file in the repo; what is not verified is
marked.

## 1. Colour

Two themes, selected by the OS (`useColorScheme`), no in-app switch in this pass. Dark is B's green-black with
ivory text; light is B's paper with A's neutral lists. Text tiers become **solid per-theme values**, replacing the
alpha clamp in `tokens.ts` (open decision 5): alpha text changes contrast with whatever sits under it, a solid
value does not, and the light theme needs its own ratios anyway.

| Role         | Dark      | Light     | Use                                                     |
| ------------ | --------- | --------- | ------------------------------------------------------- |
| `background` | `#07100d` | `#f1eee6` | Screen                                                  |
| `surface`    | `#0e1a16` | `#faf8f2` | Viewer card, inset groups on the screen, the bottom bar |
| `raised`     | `#14241e` | `#ffffff` | Sheets, dialogs, toasts, an inset group inside a sheet  |

| `text.primary` | `#ece6d8` | `#14201b` | Titles, exact values |
| `text.strong` | `#c3bfb3` | `#3c4540` | Emphasis in body copy |
| `text.body` | `#a59f90` | `#5c6259` | Body copy, record lines (the approved mockup's `--text2`) |
| `text.muted` | `#9a998f` | `#646a64` | Secondary labels |
| `text.subtle` | `#8c8c83` | `#646a64` | The floor. Light collapses onto `muted` (see below) |
| `accent` | `#5fd6a2` | `#0f7a54` | The one filled action, selected tab, links, focus ring |
| `accentBright` | `#8ce6c1` | `#0b6141` | Pressed state of the filled action |

| `onAccent` | `#07100d` | `#faf8f2` | Anything painted on `accent` |
| `negative` (error) | `#e0705f` | `#b53d2c` | Errors, "theirs" in comparisons |
| `warning` | `#e6b450` | `#8a5a00` | Stale data, soft failures |
| `info` | `#7fb6e8` | `#1f5f9e` | Neutral notices |
| `success` | = accent | = accent | Confirmations (same hue as the brand on purpose) |
| `divider` | ivory 14% | ink 16% | List dividers (mockup `--line`); decorative |
| `border` | ivory 40% | ink 50% | Field and secondary-button outlines, 3:1 (WCAG 1.4.11) |
| `fill` | ivory 7% | ink 7% | Pressed row, unselected chip, skeleton |
| `accentWash` | accent 16%| accent 16%| Selected row / chip background |

| `disabled` | ivory 32% | ink 32% | Disabled controls. Exempt from AA by WCAG 1.4.3 |

Measured contrast (WCAG 2.x, relative luminance; same method as the existing `tokens.ts` table). Every pair this
document specifies is in the table.

| Pair                                   | Dark (bg / surface / raised) | Light (bg / surface / raised) |
| -------------------------------------- | ---------------------------- | ----------------------------- |
| primary text                           | 15.5 / 14.3 / –              | 14.5 / 15.8 / –               |
| strong                                 | 10.5 / 9.7 / –               | 8.6 / 9.3 / –                 |
| body (`#a59f90` / `#5c6259`)           | 7.31 / 6.76 / 6.12           | 5.41 / 5.91 / 6.28            |
| muted                                  | 6.7 / 6.2 / 5.63             | 4.78 / 5.22 / 5.54            |
| subtle                                 | 5.7 / 5.3 / 4.76             | = muted                       |
| accent as text or icon                 | 10.7 / 9.9 / 8.94            | 4.61 / 5.03 / 5.34            |
| negative as text                       | 6.1 / 5.7 / –                | 4.94 / 5.39 / 5.72            |
| warning as text                        | 10.1 / 9.4 / –               | 5.11 / 5.58 / –               |
| info as text                           | 9.0 / 8.3 / –                | 5.68 / 6.20 / –               |
| `onAccent` on `accent` (button label)  | 10.7                         | 5.03                          |
| `onAccent` on `accentBright` (pressed) | 13.0                         | 7.06                          |
| **accent text on `accentWash`**        | 7.85 / 7.05                  | **3.72 / 4.04 — fails**       |
| primary text on `accentWash`           | 11.4 / 10.2                  | 11.7 / 12.7                   |
| **muted text on `fill`**               | 5.87 / 5.29                  | **4.19 / 4.56 — fails on bg** |
| `border` against its own background    | 3.3 / 3.3                    | 3.15 / 3.23                   |
| `divider` against its own background   | ~1.3 (decorative)            | ~1.3 (decorative)             |
| `surface` vs `background`              | 1.08                         | 1.09                          |
| `raised` vs `surface`                  | 1.10                         | 1.06                          |

Two pairs **fail** and are fixed in the spec rather than hidden: (a) a selected chip or row never sets `accent`
text on `accentWash` in light — the label is `text.primary` (11.7+), and the accent carries the underline / check
glyph (3.72, above the 3:1 graphical floor); (b) in light, `muted` / `subtle` are never placed on `fill` or
`accentWash` — text on those fills is `strong` or `primary`. The tightest passing cells are light `accent` on
`background` (4.61) and light `muted` on `background` (4.78): do not darken the light background. Light has four
text tiers because a fifth would sit below 4.5:1 on paper; `body` and `muted` in light are close (5.41 vs 4.78) by
necessity. A dash means the pair is not used on that layer.

**Separating layers without shadows.** `surface` vs `background` is only ~1.1:1 in both themes, so colour alone
does not separate them. The separators are explicit: (1) lists use `divider` hairlines, no boxes; (2) an inset
group carries a 1 px `divider` outline; (3) a sheet or dialog sits on a scrim, is `raised`, and has a 1 px
`divider` outline on its top edge; (4) the bottom bar has a 1 px `divider` on its top edge. None of these is
needed to _read_ content, so none is held to 3:1; **control boundaries are** (`border`, decision 7 below).

Rules: one filled `accent` action per screen; error and success are never colour alone (icon + word, as the
record badge already does); `accentWash` (accent 16%) for the selected-row and focused-field backgrounds only.

## 2. Typography

Bundled faces only (no new file): Cinzel 500/700, Barlow 400–700, JetBrains Mono 400/500. Sentence case
everywhere except the wordmark. Line height stays a unitless multiplier, scaled by the live font scale in
`ArenaText` (`typography.ts` header explains why); no token carries a pixel line height.

| Role                 | Face · size · weight                 | Where                                           |
| -------------------- | ------------------------------------ | ----------------------------------------------- |
| Display / wordmark   | Cinzel 32 · 700                      | "Arena" wordmark; large title at rest           |
| Heading (screen)     | Cinzel 20 · 700                      | Large title collapsed into the bar; sheet title |
| Rank numeral         | Cinzel 20 · 500                      | Roster rank column                              |
| Player name (detail) | Cinzel 30 · 500                      | Detail hero                                     |
| Subheading           | Barlow 16 · 600                      | Section headers, row titles                     |
| Body                 | Barlow 14 · 400 (leading 1.5)        | Prose, helper text                              |
| Caption              | Barlow 12 · 400                      | Row meta, timestamps                            |
| Label                | Barlow 12 · 600                      | Chips, tab labels, field labels                 |
| Button               | Barlow 15 · 600                      | All buttons                                     |
| Numeric hero         | JetBrains Mono 22 · 500              | Viewer combat power                             |
| Numeric              | JetBrains Mono 13 · 500 / 11.5 · 400 | Exact values / dense list stats                 |

**Fit with the existing scale (`typography.ts`, 24 roles).** The table above maps to existing roles
(`displayLarge`, `displaySmall`, `displayName`, `titleMedium`, `titleSmall`, `label`, `bodyMedium`, `bodySmall`,
`numericHero`, `numericMedium`, `numericSmall`). Changes, all token edits:

- **Added:** `displayRank` — Cinzel 20 · 500. It reuses `Cinzel-Medium`, already required by `displayName`, so no
  font file is added or orphaned.
- **Retired (sub-11 px, the 200 %-scale clipping risk from the audit):** `labelMicro` 10 (5 files), `labelNano`
  9.5 (9 files), `numericTiny` 10.5 (4 files), `numericMicro` 10.5 (2 files) — folded into `labelSmall` 11 and
  `numericSmall` 11.5. Their font files stay required (`Barlow-Medium` by `bodyEmphasis`, `JetBrainsMono-Medium`
  by `numericHero` and `numericMedium`), so `REQUIRED_FONT_ASSETS` and the font tests are unchanged — to be
  confirmed by running them. The retired roles carry letter-spacing (uppercase micro-labels); in sentence case
  they need none.
- **`body`** 13.5 → 14, leading kept at 1.65; `bodyMedium` has no leading and stays that way. (The first draft of
  this table said 1.5; that was wrong.)
- Everything else (`displayMedium`, `titleLarge`, `titleTiny`, `labelStrong`, `bodyCaption`, `bodyEmphasis`,
  `numericLarge`) stays as is.

**Cinzel digits are not verified tabular.** The rank cell therefore has a **fixed width of three digits' worth** (`3 × fontSize × fontScale`, computed in
`ArenaText`; React Native has no `em`) and is right-aligned, which is correct whether or not the digits are tabular. Checkable in Checkpoint 6
on a mockup rendered with the real font file.

**200 % font scale (roster row).** The rank column's width is computed from the font size and the live font scale, so it grows with the text. Above a scale threshold the row
stacks: name, then exact CP, then rounded value on its own line, then points. Exact **and** rounded values are
always rendered and never ellipsised (the Maestro `player-detail.yaml` gate asserts them). Threshold is a
runtime check on `useWindowDimensions().fontScale` (proposal: ≥ 1.5), to be tuned on the device.

## 3. Spacing, radius, elevation, motion

- **Spacing:** keep the existing 2 px-grid `space` scale and `layout` roles; add nothing. Gutter 22, row gap 14,
  section gap 28 stay.
- **Touch target:** 48 dp minimum (`layout.minTouchTarget`); a smaller control is a 48 dp `Pressable` with the
  visible shape drawn inside it (Android clips `hitSlop` to the parent's bounds, so it is not relied on).
- **Radius:** `sm 8` (fields, chips), `md 12` (inset groups), `lg 16` (sheet top corners, dialogs), `pill`
  (chips). `xl 18` is dropped — no component in the new set needs it.
- **Elevation:** none on lists (hairlines). Sheets and dialogs use a scrim (black at ~52 %, a decorative token),
  not a shadow; no `elevation` anywhere, which also avoids Android shadow artefacts on the dark theme.
- **Motion:** 120 ms for press feedback, 200 ms ease-out for sheets and the large-title collapse; the bar has
  none (`animation: 'none'`, Checkpoint 4). Reanimated is already in the project; no new animation dependency.
  Reduced motion (`AccessibilityInfo.isReduceMotionEnabled`) turns every transition into a cut.

## 4. Component library

Status: **E** exists today and is restyled, **N** new, **N\*** built only when a mockup needs it.

| Component                   | St. | Spec                                                                                                                                                                              |
| --------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArenaButton`               | E   | Variants `primary` (filled accent, **max one per screen**), `secondary` (`border` outline), `quiet` (text). Height 48, radius `sm`, Barlow 15/600.                                |
| `IconButton`                | N   | 24 px SVG in a 48 dp target; variants `plain`, `tonal`. `accessibilityLabel` is a required prop.                                                                                  |
| `Icon`                      | N   | Thin wrapper over `react-native-svg`, one file per glyph in `core/design-system/icons`, stroke 1.75, colour from tokens only.                                                     |
| `FormField`, `SearchField`  | E   | Outline = `border` (3:1), radius `sm`, height 48. Label above, always visible; helper text **only while focused or in error** (flow change F, needs your OK).                     |
| Select / dropdown           | N\* | Opens a sheet of rows with a check on the selected one. Only for screens that already have a picker.                                                                              |
| Checkbox, radio, switch     | N\* | 24 px glyph in a 48 dp target, `accent` when on.                                                                                                                                  |
| `SegmentedTabs`             | E   | Quiet underlined tabs: label 12/600, 2 px `accent` underline on the selected one, no fill, 48 dp high.                                                                            |
| `SortChip` / chips          | E   | Pill drawn inside a 48 dp pressable, `fill` background; selected = `accentWash` + **`primary` text** + `accent` check glyph (not colour alone; see the failing light pair in §1). |
| `ListRow`                   | N   | Replaces cards in lists: hairline below, optional leading rank, trailing value block, 56 dp minimum, stacks above the font-scale threshold.                                       |
| `InsetGroup`                | N   | A `surface` block with `md` radius for settings-like groups (account, filters in a sheet). The only place a "card" survives.                                                      |
| `ViewerCard`                | E   | Becomes a tappable `ListRow` on `surface` (flow change F, needs your OK); hero numeral JetBrains Mono 22.                                                                         |
| `LargeTitleHeader`          | N   | Header **inside** the list: Cinzel 32 collapses to 20 in a 56 dp bar as the list scrolls (the audit's ask).                                                                       |
| `BottomBar`                 | N   | Option 1: docked, 3 sections, icon + label 11/600, `router.replace`, hidden on pushed screens and while the keyboard is open, no transition.                                      |
| `Sheet`                     | N   | Modal bottom sheet, `lg` top radius, scrim, drag handle, max height 90 %, content scrolls, primary action sticky at the bottom.                                                   |
| `Dialog`                    | N   | Centered, `lg` radius, width ≤ 560, title + one sentence + two buttons; destructive action uses `negative` text, never a filled red button.                                       |
| `Toast`                     | N   | Bottom, above the bar, 4 s, one line + optional action, `accessibilityLiveRegion="polite"`. Replaces ad-hoc inline status text.                                                   |
| `RecordBadge`               | E   | Icon + word + colour. Variants `mine`, `theirs`, `neutral`.                                                                                                                       |
| `CompareBar`, `ProgressBar` | E   | Unchanged geometry; colours from the new tokens; the glint is dropped under reduced motion.                                                                                       |
| `EmptyState`                | N   | Glyph 48, Barlow 16/600 title, one body sentence, at most one `secondary` action. No illustrations.                                                                               |
| `ErrorState`                | N   | Same layout, `negative` glyph, a retry button. Distinguishes "could not reach the server" from "nothing here".                                                                    |
| `LoadingState`              | N   | Skeleton rows (`fill` colour, static under reduced motion) for lists; the existing progress bar stays for offers.                                                                 |

## 5. Interaction states

| State    | Treatment                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default  | As specified above.                                                                                                                               |
| Pressed  | Background → `fill` (list rows, quiet buttons); filled button → `accentBright`; 120 ms.                                                           |
| Focused  | Text fields and hardware-keyboard focus: 2 px `accent` ring offset by 2, never removed. TalkBack's own outline is the system's and is not styled. |
| Selected | `accentWash` background, `primary` text, plus a non-colour cue (underline, check, filled radio).                                                  |
| Disabled | `disabled` colour, `accessibilityState.disabled`, no press feedback. Showing a reason when an action is blocked is a behaviour change, see §7.    |
| Loading  | Control keeps its size; label replaced by an 18 px spinner; `accessibilityState.busy`.                                                            |
| Error    | `negative` outline + message with an icon below the field.                                                                                        |
| Success  | A toast with a check glyph; no persistent green state.                                                                                            |

## 6. React Native specifics

- **Tokens.** `tokens.ts` gains `colorSchemes = { dark, light }` with one shape, and a `useTheme()` hook
  (`useColorScheme`). Components read `useTheme()`; the static `color` export is kept as a **deprecated alias of
  the dark scheme** only until the last screen has moved, so each commit stays green. **Order matters:** the light
  scheme is switched on (`userInterfaceStyle: 'automatic'`) only _after_ the last screen has left the alias,
  otherwise a phone in light mode would show half-migrated screens. The root view and the splash background
  follow the scheme too (`app.config.ts`).
- **Lint.** `NO_RAW_COLOR` and `NO_RAW_SPACING` stay and keep applying outside `core/design-system`. Any edit to
  `eslint.config.js` is probed with a deliberate violation (`CLAUDE.md`). One new rule proposed: forbid importing
  the deprecated static `color` from screens once the migration ends, with its own probe.
- **Build config.** `userInterfaceStyle: 'dark'` → `'automatic'` in `app.config.ts`, as the last step of the migration (MASTER_PROMPT §4 rule 11,
  documented as a build-config change); status-bar and navigation-bar style follow the scheme. `react-native-svg`
  15.15.4 arrives via `npx expo install` (ADR-0003) with the first implementation group: **one** dev-client / EAS
  rebuild.
- **Safe area, keyboard, orientation.** Insets from `react-native-safe-area-context` (as `ScreenScaffold` does
  today); the bar hides on keyboard show; portrait stays the supported orientation.
- **Performance.** Lists stay on FlashList 2.3.2 (pinned); `ListRow` is memoised with stable props; hairlines are
  `borderBottomWidth` (no extra views); no shadows, no blur, no new animation library.
- **Tests.** The project split by extension stays. Known impact: `player-detail.yaml` (caption moves),
  `SectionTabs.test.tsx` and the section screens' tests (tab control restyled), `tokens.test.ts` (rewritten to
  assert the contrast table above for **both** schemes, so a token edit that breaks AA fails in the fast
  project), `components.test.tsx` (new components). The `Catalogue` page renders both schemes at 1× and 2× font
  scale for the visual pass.
- **Accessibility floor.** AA text contrast, 48 dp targets, a label on every icon-only control,
  `accessibilityRole` on tabs / buttons / rows, live regions for toasts, nothing clipped at 200 %.

## 7. Decisions (owner, 2026-11-20)

Token decisions — **all approved (1–7)**:

1. Light / dark follow the OS, no manual toggle in this pass.
2. Light has four text tiers (`subtle` = `muted`).
3. The four sub-11 px roles (`labelMicro`, `labelNano`, `numericTiny`, `numericMicro`) are retired.
4. `body` 13.5 → 14.
5. `success` = accent hue, `warning` amber and `info` blue added.
6. N\* components (select, checkbox, radio, switch) are built only when a mockup needs them.
7. WCAG 1.4.11 is inside the floor: field and secondary-button outlines at 3:1 (`border`).

Flow changes — **all approved (8–11)**:

8. Helper text on a field only while focused or in error. **Condition:** before this is integrated, a census of
   every text that would be hidden until focus, judged case by case (some may have to stay always visible).
   The census is a task of its own, scheduled before the form screens are implemented.
9. Tappable viewer card (a `ListRow` that opens the viewer's detail).
10. Toast replacing today's inline status text after an action.
11. A reason shown when an action is disabled (new copy per case).

The other flow changes on the list — filters in a sheet, prose into info sheets, "Read again" in a toolbar,
sticky Save — are still undecided and are not part of this checkpoint.

## 8. Not verified yet

- Cinzel digit widths (handled by a fixed-width cell; confirm on a mockup with the real font).
- The 1.5 font-scale stacking threshold (tune on the device).
- Light theme and 200 % scale on the physical device.
- The new colours are measured, not seen: Checkpoint 6 shows them on real screens.

## 9. Parere di Fable (advisor)

Consulted on the first draft, which it rejected. Concrete problems and how each was handled:

| Problem raised                                                                                   | Outcome                                                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Contrast table skipped the pairs the spec uses (accent on wash, text on fill, pressed, borders)  | Accepted. Measured; two pairs fail in light and the spec is changed (§1) |
| No elevated surface; `surface` ≈ `background` in light with no shadow                            | Accepted. `raised` added, explicit separators defined (§1)               |
| Typography claims contradicted `typography.ts` (new size, four sub-11 roles, body leading)       | Accepted. Role-by-role changes listed, font assets checked (§2)          |
| Flow changes missing from the decision list                                                      | Accepted. Items 8–11 in §7                                               |
| No `em` in React Native; `hitSlop` clipping; TalkBack focus unstyleable; 1.4.11; migration order | Accepted, each reflected in §2, §3, §5, §6 and §7                        |
| Mockup variables not reconciled with derived tiers                                               | Accepted. `body` now uses the approved `--text2` (`#a59f90` / `#5c6259`) |
