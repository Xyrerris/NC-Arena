# Fonts

Eight static TrueType faces, all SIL Open Font License 1.1, with their licences in
`licenses/`. Everything here is bundled into the APK.

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

## Three things that are easy to get wrong

**Static, not variable.** React Native on Android does not resolve a variable font's weight
axis, so a `*-VariableFont_wght.ttf` renders at a single weight whatever `fontWeight` says.
Google Fonts puts the per-weight files in `static/` inside the zip; those are the ones here.

**One family per weight.** Android picks a custom face by _file_ family name and ignores
`fontWeight`, which is why `Barlow-SemiBold` is its own family rather than Barlow at 600.
`fontAssetName()` in `src/core/design-system/typography.ts` derives the names, so the eight
filenames above are not a convention — they are what the code asks for.

**Only these eight.** Google Fonts hands over about forty faces per family. The rest were
deleted: every file in this directory ships, and the unused weights were three megabytes.
`fontLicenses.test.ts` fails if a stray one reappears.

## Adding or changing a face

1. Put the `.ttf` here and its `OFL.txt` in `licenses/`, named `OFL-<Family>.txt` with the
   family's spaces removed — `OFL-JetBrainsMono.txt`.
2. Add the entry to `FONT_ASSETS` in `src/core/design-system/fontAssets.ts`.
3. `npm test`.

The tests check more than presence. `fontLicenses.test.ts` reads the copyright out of each
font's own `name` table and asserts the licence file beside it says the same thing — the
three licences were first committed as byte-identical copies of Barlow's, which attributed
Cinzel and JetBrains Mono to the wrong authors and broke OFL compliance without breaking
anything visible. It also checks the magic bytes, so a failed download or a renamed file is
caught rather than shipped.
