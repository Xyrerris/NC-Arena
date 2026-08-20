/**
 * Type scale and font loading (ARCHITECTURE.md §2.5, §6).
 *
 * ## Line height is a multiplier, not a pixel value
 *
 * React Native scales `fontSize` with the OS font setting and does **not** scale
 * `lineHeight`. A token that carried `lineHeight: 22` would therefore clip its own text at
 * 200 % scale — the exact failure §2.5 is about. So leading is stored unitless and
 * `ArenaText` multiplies it by the live font scale. Most roles omit it entirely and let the
 * font's own metrics decide, which is the safest thing a single line of text can do.
 *
 * ## The bundled faces
 *
 * Eight static TrueType files under `assets/fonts`, all SIL Open Font License 1.1, with the
 * licences alongside them; the `require` map lives in `fontAssets.ts`. Static rather than
 * variable: React Native on Android does not resolve a variable font's weight axis, so a
 * `*-VariableFont_wght.ttf` renders at one weight whatever `fontWeight` says.
 *
 * Only the eight weights the type scale actually names are committed. The rest of each
 * family was deleted rather than kept "just in case" — every file there is bundled into the
 * APK, and thirty-two unused faces is three megabytes of it.
 *
 * This module imports nothing: no react-native, no assets. That is what lets the scale be
 * tested in the fast Jest project alongside the tokens.
 */

export const fontFamily = {
  /** Cinzel — the "Arena" wordmark and screen titles. */
  display: 'Cinzel',
  /** Barlow — everything that is a word rather than a number. */
  body: 'Barlow',
  /**
   * JetBrains Mono — every numeric column. Monospaced so a 13-character stat value does
   * not jitter as it scrolls; `ArenaText` additionally sets `tabular-nums` so the fallback
   * font cannot reintroduce the jitter.
   */
  numeric: 'JetBrainsMono',
} as const;

export type FontRole = 'display' | 'body' | 'numeric';

export interface TypeStyle {
  readonly role: FontRole;
  readonly fontSize: number;
  readonly fontWeight: '400' | '500' | '600' | '700';
  /** Unitless. Omitted where the font's default metrics are correct. */
  readonly leading?: number;
  readonly letterSpacing?: number;
}

const style = (
  role: FontRole,
  fontSize: number,
  fontWeight: TypeStyle['fontWeight'],
  extra: { leading?: number; letterSpacing?: number } = {},
): TypeStyle => ({ role, fontSize, fontWeight, ...extra });

/**
 * Every role the prototype actually uses. Sizes and weights are its values verbatim; the
 * names are new, because `font:600 15px/1 Barlow` is not a name.
 */
export const typeScale = {
  /** "Arena", on the roster screen. */
  displayLarge: style('display', 32, '700', { leading: 1.05 }),
  displayMedium: style('display', 28, '700', { leading: 1.1 }),
  displaySmall: style('display', 20, '700'),
  /** The player name on the detail screen. */
  displayName: style('display', 30, '500', { leading: 1.15 }),

  titleLarge: style('body', 22, '600'),
  titleMedium: style('body', 16, '600'),
  titleSmall: style('body', 15, '600'),
  titleTiny: style('body', 13, '600'),

  label: style('body', 12, '600'),
  labelSmall: style('body', 11, '600'),
  labelStrong: style('body', 11, '700'),
  labelMicro: style('body', 10, '500', { letterSpacing: 1.2 }),
  labelNano: style('body', 9.5, '500', { letterSpacing: 1 }),

  body: style('body', 13.5, '400', { leading: 1.65 }),
  bodyMedium: style('body', 14, '400'),
  bodySmall: style('body', 12, '400', { leading: 1.5 }),
  bodyCaption: style('body', 11, '400'),
  bodyEmphasis: style('body', 14, '500'),

  /** The viewer's combat power. */
  numericHero: style('numeric', 22, '500'),
  numericLarge: style('numeric', 19, '500'),
  numericMedium: style('numeric', 13, '500'),
  /** Exact stat values in a list row. */
  numericSmall: style('numeric', 11.5, '400', { leading: 1.6 }),
  numericTiny: style('numeric', 10.5, '400'),
  /** The season label. */
  numericMicro: style('numeric', 10.5, '500', { letterSpacing: 1.26 }),
} as const;

export type TypeRole = keyof typeof typeScale;

/**
 * Pixel line height for a role, compensated for the OS font scale.
 *
 * `fontScale` is required rather than defaulted to `PixelRatio.getFontScale()`. That read is
 * static: a component using it would not re-render when the OS font setting changes, which
 * is the one thing this function exists to track. `ArenaText` passes the live value from
 * `useWindowDimensions`.
 *
 * Returns undefined where the role has no leading, which is the common case and leaves the
 * platform free to use the font's own metrics.
 */
export const lineHeightFor = (style_: TypeStyle, fontScale: number): number | undefined =>
  style_.leading === undefined
    ? undefined
    : Math.round(style_.fontSize * style_.leading * fontScale);

/**
 * Android resolves a custom font by *file* family name and ignores `fontWeight`, so each
 * weight is its own family. Deriving the name here means the list below is generated from
 * the type scale rather than maintained by hand.
 */
const WEIGHT_SUFFIX = {
  '400': 'Regular',
  '500': 'Medium',
  '600': 'SemiBold',
  '700': 'Bold',
} as const;

export const fontAssetName = (style_: TypeStyle): string =>
  `${fontFamily[style_.role]}-${WEIGHT_SUFFIX[style_.fontWeight]}`;

/**
 * Exactly the font files the type scale needs — the keys `FONT_ASSETS` must have once the
 * OFL files are committed. A test asserts that `FONT_ASSETS` is either empty or complete,
 * so a half-finished drop fails loudly instead of rendering three faces and one fallback.
 */
export const REQUIRED_FONT_ASSETS: readonly string[] = [
  ...new Set(Object.values(typeScale).map(fontAssetName)),
].sort();
