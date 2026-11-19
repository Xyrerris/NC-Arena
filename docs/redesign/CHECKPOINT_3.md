# Checkpoint 3 — three creative directions

2026-11-19. Interactive mockup: [`mockups/directions.html`](mockups/directions.html) (open in a browser; switch
direction and dark / light at the top). Three screens per direction: Roster, Player detail, Collection · Offers.
Sample rows come from the emulator data of 2026-11-19; the second Offers row is a placeholder. Rounded CP
follows the app's own format (millions, `55.163,72 M`), stat values billions (`1,36 B`).

All three keep every function: the viewer's "Update my stats" entry and Score, SELECT on offers, exact **and**
rounded values on every number, the filter summary. Items marked **F** change a flow and wait for approval.

## The twelve fields

| Field            | A · Graphite                                                                        | B · Noir Crest                                                                                  | C · Soft Paper                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Philosophy       | Say less. The data is the interface; chrome disappears.                             | A ladder has a crest. Calm, but it still feels like an arena.                                   | Friendly and tactile. Soft surfaces, nothing sharp.                                                                                                                 |
| Visual identity  | Neutral graphite, one mint accent, no tint in the greys                             | Deep green-black, ivory text, mint accent, Cinzel for names and ranks                           | Tonal surfaces, light first, rounded everywhere                                                                                                                     |
| Palette          | Dark `#0e0f10` / `#17181a`, light `#f6f7f6`; accent `#5fd6a2` dark, `#0f7a54` light | Dark `#07100d` / `#0e1a16`, light paper `#f1eee6`; accent `#5fd6a2` / `#0f7a54`                 | Dark `#101514` / `#1b2220`, light `#eef2f0`; accent `#6fdcb0` / `#0c7451`                                                                                           |
| Typography       | Inter + JetBrains Mono for numbers                                                  | Cinzel (title, rank numerals only) + Barlow + JetBrains Mono                                    | Manrope for everything, numbers included (not monospaced)                                                                                                           |
| Components       | Hairline lists, no cards, text tabs with underline, one filled action per screen    | Sharp 10 px corners, 1 px outlines, labels in small caps, filled accent only for the key action | 22 px corners, no outlines, pill controls, tonal chips                                                                                                              |
| Surfaces / cards | None: separators only; the viewer is a hairline row                                 | Outlined groups; the viewer is a highlighted ladder row with a 3 px accent edge                 | Soft shadowed inset groups                                                                                                                                          |
| Iconography      | 1.75–2 px outline icons, rounded caps (chevron, plus, search, sliders)              | Same set, heavier 2 px                                                                          | Filled-tonal icons in circles                                                                                                                                       |
| Navigation       | Underlined top tabs (keeps current structure)                                       | Segmented top control (keeps current structure)                                                 | Floating bottom bar (**F**) or the same top tabs                                                                                                                    |
| Spacing          | 20 px gutter, 12–14 px row rhythm, generous                                         | 20 px gutter, tighter rows, large rank column                                                   | 20 px gutter, 16 px group padding                                                                                                                                   |
| Animation        | Large-title collapse, 150 ms press fade                                             | Rank-change slide, press scale 0.98, row swipe reveals W/L                                      | Spring on sheets and the tab bar                                                                                                                                    |
| Strengths        | Closest to Apple, best readability, least to maintain                               | Keeps what makes the app recognisable; numbers and ranks read first                             | Most current, friendliest in light mode                                                                                                                             |
| Risks            | Generic: nothing says "arena"                                                       | The serif must stay rare or it turns theatrical again                                           | Drops monospaced numerals (reverses `typography.ts`); floating bar covers the last row at 200 % font scale (the roster code already rejected a FAB for that reason) |

## Contrast (computed, WCAG, all six themes)

Every pair measured with a script: text on background and surface ≥ 5.05, secondary text ≥ 5.05,
accent on background ≥ 4.61, text on accent fills ≥ 5.03. Minimum 4.61 (B light, accent text on paper),
above the 4.5 floor in `tokens.ts`. The first draft's light accents (`#138a5e`, `#0e8a64`) were 4.35 and
failed; they are corrected in the mockup.

## Consequences the owner should know

- **Icons need `react-native-svg`**, a native module: a new dev client and new EAS builds, plus an SVG
  asset pipeline. This is the one dependency risk. **Question for you: allowed?** The alternative is a
  small hand-drawn set built from `View`s, which is worse quality and only suits chevron / plus.
- **Fonts.** Inter and Manrope on Android need static weight files (the variable ones render at one weight).
  B reuses Cinzel / Barlow / JetBrains Mono, already bundled: no new asset.
- **Light + dark** means `userInterfaceStyle` changes from `'dark'` in `app.config.ts` (a build-config change;
  reason: both themes were requested) and the contrast table in `tokens.ts` is replaced by per-theme values.
- **Longer rows.** Exact plus rounded CP on each roster row makes lines longer; 200 % font scale must be checked.
- **Collapsing header** needs the header inside the list, which is also the layout fix the audit asked for.
- The mockup is HTML with CSS variables; it is not React Native and carries no native behaviour.

## Parere di Fable (advisor)

Fable was consulted through the `advisor` tool and answered. It first rejected my draft as incomplete and
misleading, then gave its recommendation.

Criticisms and what I did:

1. _The twelve §7 fields were missing; icons and animation absent._ **Accepted**, the table above; the mockup
   now uses SVG icons.
2. _Third screen invented content and dropped SELECT; roster dropped "Update my stats" and Score; rounded CP
   used B where the app uses M; Triplexmazi's rank was wrong._ **Accepted.** The screen is now Collection ·
   Offers with SELECT; the viewer keeps Score and "Update my stats"; values use the app's format and the real
   rows from the emulator.
3. _A and B were the same design in two fonts._ **Accepted.** A has a neutral graphite background, no viewer
   card and underline tabs; B has a dominant Cinzel rank column and a highlighted ladder row for the viewer.
4. _Light accents failed contrast._ **Accepted**, recomputed, see above.
5. _State the risks (icons are native, C drops monospaced numerals, C's bar and 200 %, fonts, longer rows)._
   **Accepted**, listed above.

Fable's recommendation: **base on B and adopt A's structure** (hairline lists, one filled action per screen,
quiet tabs). B keeps the only brand signals the app has; A's structure fixes the audit's main problems.
Not A alone, because it is generic; not C, because its light-first rounded look loses the game character,
its numerals stop being monospaced and its navigation depends on a flow change. It is a hybrid and is labelled
as such, not as a fourth direction.

My view as Sonnet: I agree with the hybrid. One reservation: the light theme is where C is strongest, so the
hybrid's light variant (paper `#f1eee6` from B, A's neutral lists) needs a dedicated look at the next checkpoint.

## Decisions I need from you (Checkpoint 4)

1. Direction: **Hybrid B+A (recommended)**, or A, B or C as drawn.
2. `react-native-svg` for icons: yes / no.
3. Keep Cinzel (limited to the wordmark, screen titles and rank numerals)?
4. Bottom tab bar: not proposed with the hybrid; say if you want it evaluated as a separate **F** proposal.

## Housekeeping

- You are on `fix/roster-flashlist-2.3.2`; the redesign branch still pins FlashList at 2.0.2, so a fresh install
  there brings the empty roster back. The fix should be merged into `feature/application-design-restyle`
  before any redesign work is committed. Nothing is pushed.
