/**
 * The app's one button.
 *
 * Until now every affordance was a bespoke `Pressable` wrapping an `ArenaText` — fine when
 * there were two of them (the roster's retry, the detail screen's back). ADR-0020 adds
 * six, half of them destructive or submitting, and at that point "48 dp tall, disabled
 * means announced-as-disabled, destructive means it says so and does not only look so"
 * stops being something each screen should re-decide.
 *
 * The three variants are roles, not colours: `primary` commits, `secondary` retreats,
 * `destructive` removes. That is what keeps ROADMAP.md Phase 6's non-colour-redundancy
 * rule enforceable — a caller picks a meaning, and this file decides how it looks.
 */

import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ArenaText, type Tone } from './ArenaText';
import { color, layout, radius, space } from './tokens';

export type ArenaButtonVariant = 'primary' | 'secondary' | 'destructive';

export interface ArenaButtonProps {
  label: string;
  onPress: () => void;
  variant?: ArenaButtonVariant;
  disabled?: boolean;
  /** Replaces the label with a spinner and blocks the press. Implies `disabled`. */
  busy?: boolean;
  /** Defaults to the label. Set it where the label alone is not a sentence. */
  accessibilityLabel?: string;
  /** True stretches the button across its row, for a form's primary action. */
  fill?: boolean;
  testID?: string;
}

const TONE: Record<ArenaButtonVariant, Tone> = {
  primary: 'onAccent',
  secondary: 'accent',
  destructive: 'negative',
};

export function ArenaButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  fill = false,
  testID,
}: ArenaButtonProps) {
  const inert = disabled || busy;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      // Announced, not merely painted: a greyed-out control that TalkBack still offers as
      // pressable is worse than one that never dims.
      accessibilityState={{ disabled: inert, busy }}
      disabled={inert}
      onPress={onPress}
      style={[styles.root, fill && styles.fill, inert && styles.inert]}
      testID={testID}
    >
      <View style={[styles.body, VARIANTS[variant]]}>
        {busy ? (
          <ActivityIndicator color={variant === 'primary' ? color.onAccent : color.accent} />
        ) : (
          <ArenaText variant="labelStrong" tone={TONE[variant]} align="center">
            {label.toUpperCase()}
          </ArenaText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: layout.minTouchTarget, justifyContent: 'center' },
  fill: { flex: 1 },
  /** Dimmed rather than recoloured, so a disabled destructive button is still red. */
  inert: { opacity: 0.5 },
  body: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space[20],
    paddingVertical: space[10],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});

const VARIANTS = StyleSheet.create({
  primary: { backgroundColor: color.accent, borderColor: color.accent },
  secondary: { backgroundColor: color.decorative.fill, borderColor: color.decorative.accentEdge },
  destructive: { backgroundColor: color.decorative.fill, borderColor: color.negative },
});
