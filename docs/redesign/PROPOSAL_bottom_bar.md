# Proposal (flow change, **F**): docked bottom navigation bar

2026-11-19. Separate from the visual redesign, as you asked. Mockup:
[`mockups/bottom-bar.html`](mockups/bottom-bar.html) (today vs proposed, 100 % and 200 % text).

## Today

`SectionTabs` is a segmented control at the top of the Arena, Collection and Upgrade screens. It switches with
`router.replace`, so each section starts fresh and there is no history to unwind (ADR-0044). The Stack
navigator has no tab layout. `/me`, the player screens and the forms are pushed screens with no switcher.

## Two ways to build it

**Option 1 — restyle and move the control (recommended).** Keep the Stack and `router.replace`; render the
same `SectionTabs` as a docked bar at the bottom of the three section routes. Behaviour identical, URLs and
deep links unchanged, no route moves. Touches `SectionTabs`, `ScreenScaffold`, the three section screens'
bottom padding, and their tests.

**Option 2 — a real tab navigator (`Tabs` / a `(tabs)` group).** Keeps each section's scroll position and
state, but moves three routes into a group, changes how Android back behaves between sections (leave the app
vs go to the previous tab), reopens ADR-0044's "siblings, not a flow" decision, and rewrites route tests.
Larger, riskier, and a different feature (state retention) from the one asked for.

## What the bar looks like

Docked, Material 3 style: about 80 dp, three destinations, an outline icon over a short label, an active
"pill" behind the icon in the accent tint. **Not floating**: a floating pill (the C direction) covers the
last list row at 200 % font scale, the exact problem the roster code already rejected a FAB for. A docked
bar takes its own space, so the list ends above it.

## Why do it

- Thumb reach: the section switch moves from the top edge to the bottom edge on a tall phone.
- It frees the top band for the title, which is what the audit asked for (chrome ate ~65 % of the roster).
- Three destinations is the range Android's navigation bar is designed for.

## Costs and risks

- **Vertical space is a net cost, not neutral.** On the emulator (density 560, 3.5 px per dp) the top control
  is 196 px = 56 dp. A Material bar is 80 dp plus the gesture inset (about 24 dp), so about 104 dp: roughly
  **+48 dp** (about 5 % of an 882 dp screen) taken from the list.
- **200 % text, measured in the mockup** with every size exactly doubled: the three labels (Arena, Collection,
  Upgrade) each fit on one line in a 122 px cell, no overflow. That is a mockup, not a device: confirm on the
  physical phone. `maxFontSizeMultiplier` on the labels would cap scaling and work against the project's 200 %
  gate, so it is a decision, not a fix: if a device shows clipping, the options are let the bar grow, let labels
  wrap, or go icon-only above a scale.
- **Transition.** The Stack sets no `animation` option, so each section switch uses the platform default and
  the content slides while a per-screen bar would slide with it. Option 1 needs `animation: 'none'` (or a
  fade) on the three section routes so the bar stays still. A small navigation-config change.
- **Keyboard.** The activity uses `adjustResize`, so with the roster search focused a bar inside the screen
  rides up above the keyboard. The bar must hide while the keyboard is open.
- Gesture-navigation inset: the bar must add the bottom safe-area inset and sit on top of the system bar.
- Pushed screens keep no bar (as now), so opening a player hides it. Say if you would rather keep it visible.
- Icons come from `react-native-svg` (approved) — the bar is the first consumer.
- The Maestro flows and `SectionTabs.test.tsx` pin the current control and need updating.
- Findings from the 200 % mockup, for the design system: (1) the rank column must scale with the font (sized
  in `em`), or the large Cinzel numeral overlaps the name; (2) at 200 % the exact CP no longer fits beside the
  points, and it broke mid-number. The roster row needs a stacked layout above a font scale: name, then exact
  CP, then the rounded value on its own line, points below. Both values stay visible.

## Parere di Fable (advisor)

Consulted through the `advisor` tool; it first rejected my draft, then endorsed the scope.

- _The 200 % phone was not 200 % and dropped the rounded value; the dock was cut off in the capture._
  **Accepted**: re-built with exact doubling, both values kept, re-rendered with the dock visible, measured.
- _Option 1 has unlisted costs: the transition, the keyboard, the vertical-space number._ **Accepted**, above.
- Endorsement: **Option 1 is the right scope** (Option 2 is a different feature and reopens ADR-0044 and
  Android back behaviour), on three conditions: a fixed bar with no transition, hidden while the keyboard is up,
  honest 200 % behaviour. Hiding the bar on pushed screens: agreed.

## Needs your decision

1. Option 1 (recommended), Option 2, or leave the top control.
2. If Option 1: keep the bar hidden on pushed screens (recommended)?
