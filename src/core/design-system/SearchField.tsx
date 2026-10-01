/**
 * Roster search. The `TextInput` is 48 dp tall.
 *
 * It carries no `accessibilityLabel` by default: that becomes the node's `contentDescription`,
 * which TalkBack reads *instead of* what has been typed (the Accessibility Scanner's
 * "editable label" finding), and the placeholder is already the field's name while it is empty.
 * A caller that has a reason to name it differently can still pass one.
 */

import { StyleSheet, TextInput, View } from 'react-native';

import { color, layout, radius, space } from './tokens';
import { FONTS_BUNDLED } from './fontAssets';
import { designStrings } from './strings';
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
  placeholder = designStrings.searchField.placeholder,
  accessibilityLabel,
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
