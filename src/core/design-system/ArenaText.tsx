/**
 * The single text primitive. Every other component in the app renders text through this
 * one, which is the point: the three decisions below are made once here instead of being
 * renegotiated in each screen.
 *
 * 1. **Font scaling is not capped by default** (ARCHITECTURE.md §2.5). Capping it is an
 *    accessibility regression, so `maxFontSizeMultiplier` is opt-in per call site and each
 *    use is expected to carry a reason. The layout is what has to survive 200 %, not the
 *    text.
 * 2. **Numerics get `tabular-nums`.** The exact column is the product's core promise; a
 *    fallback face with proportional digits makes it jitter mid-scroll. This holds whether
 *    or not JetBrains Mono is bundled.
 * 3. **Colour comes from a tone, not a string.** There is no way to pass a raw hex, so the
 *    §2.4 contrast floor is not something anyone has to remember.
 */

import type { ReactNode } from 'react';
import {
  Text,
  useWindowDimensions,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { FONTS_BUNDLED } from './fontAssets';
import { color } from './tokens';
import { fontAssetName, lineHeightFor, typeScale, type TypeRole } from './typography';

const TONES = {
  primary: color.text.primary,
  strong: color.text.strong,
  body: color.text.body,
  muted: color.text.muted,
  subtle: color.text.subtle,
  accent: color.accent,
  accentBright: color.accentBright,
  negative: color.negative,
  onAccent: color.onAccent,
} as const;

export type Tone = keyof typeof TONES;

export interface ArenaTextProps extends Omit<TextProps, 'style' | 'children'> {
  /**
   * Named `variant` rather than `role`, because React Native already has a `role` prop —
   * the ARIA one — and shadowing it would take an accessibility affordance away from every
   * piece of text in the app.
   */
  variant?: TypeRole;
  tone?: Tone;
  align?: TextStyle['textAlign'];
  /**
   * Opt in only with a reason, and record it in the call site's comment — Phase 6 audits
   * every one of these (ROADMAP.md Phase 6, "documented per component with a reason").
   */
  maxFontSizeMultiplier?: number;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}

export function ArenaText({
  variant = 'body',
  tone = 'body',
  align,
  style,
  children,
  ...rest
}: ArenaTextProps) {
  // `useWindowDimensions` rather than `PixelRatio.getFontScale()`: it re-renders when the
  // OS font setting changes while the app is backgrounded, which the static read does not.
  const { fontScale } = useWindowDimensions();
  const spec = typeScale[variant];

  const resolved: TextStyle = {
    fontSize: spec.fontSize,
    fontWeight: spec.fontWeight,
    lineHeight: lineHeightFor(spec, fontScale),
    letterSpacing: spec.letterSpacing,
    color: TONES[tone],
    textAlign: align,
  };

  if (spec.role === 'numeric') {
    resolved.fontVariant = ['tabular-nums'];
  }
  if (FONTS_BUNDLED) {
    // Android picks a custom face by family name and ignores fontWeight, so the weight is
    // baked into the family and the numeric weight is left in place for the fallback path.
    resolved.fontFamily = fontAssetName(spec);
  }

  return (
    <Text {...rest} style={[resolved, style]}>
      {children}
    </Text>
  );
}
