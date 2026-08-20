# Fonts

**Status: not yet committed.** The app currently renders in the platform's default face at
the correct sizes and weights. That is a real gap, not a design choice — the display face is
half the product's character — and it is the one unfinished part of ROADMAP.md Phase 1.

## What to add

Eight files, all SIL Open Font License 1.1. The list is derived from the type scale in
`src/core/design-system/typography.ts`, so it is exactly what the app asks for and nothing
more:

| File                        | Family         | Weight | Used by                     |
| --------------------------- | -------------- | ------ | --------------------------- |
| `Cinzel-Bold.ttf`           | Cinzel         | 700    | `displayLarge/Medium/Small` |
| `Cinzel-Medium.ttf`         | Cinzel         | 500    | `displayName`               |
| `Barlow-Regular.ttf`        | Barlow         | 400    | body copy, captions         |
| `Barlow-Medium.ttf`         | Barlow         | 500    | `labelMicro`, `labelNano`   |
| `Barlow-SemiBold.ttf`       | Barlow         | 600    | titles, labels              |
| `Barlow-Bold.ttf`           | Barlow         | 700    | `labelStrong`               |
| `JetBrainsMono-Regular.ttf` | JetBrains Mono | 400    | small numerics              |
| `JetBrainsMono-Medium.ttf`  | JetBrains Mono | 500    | hero and large numerics     |

Android resolves a custom face by _file_ family name and ignores `fontWeight`, which is why
each weight is a separate family rather than one family with four weights.

## How to wire them up

1. Drop the eight `.ttf` files in this directory.
2. Add each licence under `assets/fonts/licenses/` — `OFL-Cinzel.txt`,
   `OFL-Barlow.txt`, `OFL-JetBrainsMono.txt`. The OFL requires the licence to ship with
   the font; this is not optional and it is not covered by the repository's own LICENSE.
3. Fill in `FONT_ASSETS` in `src/core/design-system/typography.ts`:

   ```ts
   export const FONT_ASSETS: Record<string, number> = {
     'Cinzel-Bold': require('../../../assets/fonts/Cinzel-Bold.ttf'),
     // ...one entry per row of the table above
   };
   ```

4. Run `npm test`. `typography.test.tsx` asserts that `FONT_ASSETS` is either empty or
   complete, so a partial drop fails there rather than shipping one real face next to seven
   fallbacks — which looks like a design bug and gets triaged as one.

Nothing else changes. `FONTS_BUNDLED` flips to true on its own, `ArenaText` starts naming a
family, and the root layout already holds the splash screen until `useArenaFonts` resolves.

## Why they are not here

Binary assets could not be added in the session that built the design system. Fetching a
font file is a download, and downloads are the user's call, not the agent's.
