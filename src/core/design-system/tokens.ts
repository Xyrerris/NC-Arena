/**
 * Design tokens, extracted from `design/Arena Scout.dc.html` (ARCHITECTURE.md §2.4, §6).
 *
 * Everything is `as const`, so a colour or a spacing value that is not in a scale is a
 * type error rather than a review comment. Nothing outside this directory may write a raw
 * hex string or a raw spacing number — enforced by `no-restricted-syntax` in
 * eslint.config.js and checked by `npm run check:boundaries`.
 *
 * ## The contrast floor
 *
 * The prototype renders body text at six alpha levels between 0.30 and 0.42. Measured
 * against the surfaces below, every one of them fails WCAG AA:
 *
 * ```
 * alpha   on #08120f   on #0e1a16   AA (4.5:1)
 * 0.30      2.44:1       2.49:1        no
 * 0.35      2.90:1       2.93:1        no
 * 0.40      3.43:1       3.44:1        no
 * 0.42      3.67:1       3.66:1        no
 * 0.50      4.72:1       4.66:1        yes   <- the floor
 * 0.55      5.48:1       5.37:1        yes
 * 0.60      6.33:1       6.16:1        yes
 * 0.72      8.70:1       8.35:1        yes
 * ```
 *
 * So `text.*` clamps at alpha 0.50 and `decorative.*` holds the sub-floor values for the
 * things that are not text: hairlines, bar tracks, chip backgrounds. The split is what
 * makes the rule enforceable — "use a text token for text" instead of "remember the
 * contrast table".
 *
 * **This is open decision 5 and it is not signed off.** ARCHITECTURE.md §2.4 states the
 * clamp as a decision and ROADMAP.md lists design approval as still outstanding. It is
 * implemented here because a token module has to pick a number, and because reverting is
 * a one-file change — which is the entire reason the values live in one file. If design
 * waives AA, edit `text` below and nothing else moves.
 */

/** Raw palette. Never referenced outside this file — use the semantic groups below. */
const palette = {
  backdrop: '#07100d',
  surface: '#08120f',
  raised: '#0e1a16',
  accent: '#5fd6a2',
  accentBright: '#8ce6c1',
  accentDeep: '#12241d',
  onSurface: '232, 239, 236',
  onAccent: '#08120f',
  negative: '#e0705f',
} as const;

const onSurface = (alpha: number) => `rgba(${palette.onSurface}, ${alpha})` as const;
const accent = (alpha: number) => `rgba(95, 214, 162, ${alpha})` as const;

export const color = {
  /** Page background, behind everything. */
  backdrop: palette.backdrop,
  /** Cards and sheets sitting on the backdrop. */
  surface: palette.surface,
  /** A card on a card — the viewer hero, the head-to-head panel. */
  raised: palette.raised,

  accent: palette.accent,
  accentBright: palette.accentBright,
  accentDeep: palette.accentDeep,
  /** Foreground for anything painted on `accent` — 10.53:1. */
  onAccent: palette.onAccent,
  negative: palette.negative,

  /**
   * Text. Every value clears AA on backdrop, surface and raised alike.
   * The prototype alpha each one replaces is noted, so the design can be diffed.
   */
  text: {
    /** Headings, exact stat values. Was alpha 1.0. */
    primary: onSurface(1),
    /** Emphasis inside body copy. Was 0.72. */
    strong: onSurface(0.72),
    /** Body copy, record lines. Was 0.6. */
    body: onSurface(0.6),
    /** Secondary labels. Was 0.45 and 0.5. */
    muted: onSurface(0.55),
    /** The floor. Was 0.3, 0.34, 0.35, 0.38, 0.4 and 0.42. */
    subtle: onSurface(0.5),
  },

  /**
   * Not text, and therefore not clamped. A hairline at alpha 0.12 is a hairline; raising
   * it to 0.5 would draw a box the design does not have. Anything a screen reader would
   * announce belongs in `text` instead.
   */
  decorative: {
    hairline: onSurface(0.12),
    divider: onSurface(0.09),
    /** Unselected sort chip, search field fill. */
    fill: onSurface(0.07),
    fillStrong: onSurface(0.08),
    /** The unfilled remainder of a comparison bar. */
    track: onSurface(0.08),
    accentWash: accent(0.16),
    accentWashFaint: accent(0.03),
    accentEdge: accent(0.22),
    accentHairline: accent(0.14),
  },

  /** Bar fills and record colours. Colour alone is not sufficient — see ROADMAP Phase 6. */
  compare: {
    mine: palette.accent,
    theirs: palette.negative,
  },
} as const;

/**
 * Spacing, on a 2 px grid. These are every value the prototype uses and no others, keyed
 * by the value itself: `space[16]` reads as the design does, and `space[15]` does not
 * compile. Two prototype values are snapped — 9 px and 58 px, to 8 and 56 — because a
 * scale with a 9 in it is a list.
 */
export const space = {
  0: 0,
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  22: 22,
  26: 26,
  28: 28,
  40: 40,
  56: 56,
} as const;

/** Recurring roles, so a screen says what it means rather than how many pixels. */
export const layout = {
  screenGutter: space[22],
  cardPadding: space[16],
  cardGap: space[12],
  rowGap: space[14],
  sectionGap: space[28],
  /** Android touch-target minimum. Sort chips are ~30 dp in the prototype (defect 9). */
  minTouchTarget: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  pill: 9999,
} as const;

export type Space = (typeof space)[keyof typeof space];
export type Radius = (typeof radius)[keyof typeof radius];
