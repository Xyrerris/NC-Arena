/**
 * A labelled text input, with room for the reason it was rejected.
 *
 * `SearchField` next door is deliberately not reused. It is one control with one job and
 * no label — a placeholder is not a label, as its own header says — whereas a form needs a
 * persistent label, a keyboard type per field, and an error that survives the value being
 * wrong. Sharing them would mean a search box that grew an `error` prop nothing renders.
 *
 * Three accessibility decisions, made here so no screen has to make them again:
 *
 * - **The label is the accessible name**, so a screen reader announces the field even once
 *   the placeholder has gone.
 * - **The error is part of that announcement**, not a red line floating nearby.
 *   `aria-invalid` is what tells TalkBack the field is in an error state rather than
 *   merely near some red text.
 * - **The error is never colour-only.** It reads as a sentence, which satisfies the same
 *   rule ROADMAP.md Phase 6 applies to the comparison bars.
 */

import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { ArenaText } from './ArenaText';
import { FONTS_BUNDLED } from './fontAssets';
import { color, layout, radius, space } from './tokens';
import { fontAssetName, typeScale } from './typography';

export interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  /** The rejection from `validatePlayerDraft`, or null while the field is acceptable. */
  error?: string | null;
  /** Static guidance — units, ranges. Hidden once `error` replaces it. */
  hint?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  maxLength?: number;
  /** True renders the value in the tabular numeric face, so digit columns line up. */
  numeric?: boolean;
  testID?: string;
}

const textSpec = typeScale.bodyMedium;
const numericSpec = typeScale.numericMedium;

export function FormField({
  label,
  value,
  onChangeText,
  error = null,
  hint,
  placeholder,
  keyboardType,
  autoFocus,
  maxLength,
  numeric = false,
  testID,
}: FormFieldProps) {
  const invalid = error !== null && error !== '';

  return (
    <View style={styles.root}>
      <ArenaText variant="labelMicro" tone="muted">
        {label.toUpperCase()}
      </ArenaText>

      <TextInput
        accessibilityLabel={label}
        aria-invalid={invalid}
        autoCapitalize={numeric ? 'none' : 'words'}
        autoCorrect={false}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.text.subtle}
        style={[styles.input, numeric && styles.numeric, invalid && styles.inputInvalid]}
        testID={testID}
        value={value}
      />

      {invalid ? (
        <ArenaText variant="bodyCaption" tone="negative" testID={testID && `${testID}-error`}>
          {error}
        </ArenaText>
      ) : hint === undefined ? null : (
        <ArenaText variant="bodyCaption" tone="subtle">
          {hint}
        </ArenaText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[6] },
  input: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: space[14],
    // Vertical padding as well as a minimum height: at 200 % font scale the text is taller
    // than the 48 dp floor, and a height-only box clips its own descenders.
    paddingVertical: space[10],
    backgroundColor: color.decorative.fill,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.decorative.hairline,
    color: color.text.primary,
    fontSize: textSpec.fontSize,
    fontWeight: textSpec.fontWeight,
    ...(FONTS_BUNDLED ? { fontFamily: fontAssetName(textSpec) } : null),
  },
  numeric: {
    fontVariant: ['tabular-nums'],
    fontSize: numericSpec.fontSize,
    ...(FONTS_BUNDLED ? { fontFamily: fontAssetName(numericSpec) } : null),
  },
  inputInvalid: { borderColor: color.negative },
});
