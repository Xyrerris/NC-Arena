/**
 * Roster search. The `TextInput` is 48 dp tall and labelled, because a placeholder is not
 * a label — it disappears the moment anyone types.
 */

import { StyleSheet, TextInput, View } from 'react-native';

import { color, layout, radius, space } from './tokens';
import { FONTS_BUNDLED } from './fontAssets';
import { fontAssetName, typeScale } from './typography';

export interface SearchFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  testID?: string;
}

const spec = typeScale.bodyMedium;

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search players',
  accessibilityLabel = 'Search players by name',
  testID,
}: SearchFieldProps) {
  return (
    <View style={styles.root}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.text.subtle}
        returnKeyType="search"
        style={styles.input}
        testID={testID}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: color.decorative.fill,
    borderRadius: radius.md,
    paddingHorizontal: space[14],
    justifyContent: 'center',
  },
  input: {
    minHeight: layout.minTouchTarget,
    color: color.text.primary,
    fontSize: spec.fontSize,
    fontWeight: spec.fontWeight,
    ...(FONTS_BUNDLED ? { fontFamily: fontAssetName(spec) } : null),
  },
});
