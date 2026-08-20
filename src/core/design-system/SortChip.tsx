/**
 * A sort selector. Prototype defect 9: the chips are `padding: 8px 14px` on an 11 px font,
 * which lands around 30 dp — below the 48 dp touch minimum.
 *
 * The fix keeps the design and moves the target: the visible pill is unchanged, and the
 * pressable around it is 48 dp tall with the pill centred inside, plus horizontal hitSlop.
 * The chip row therefore gets taller; the chip does not.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { ArenaText } from './ArenaText';
import { color, layout, radius, space } from './tokens';

export interface SortChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

export function SortChip({ label, selected, onPress, testID }: SortChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ left: space[8], right: space[8] }}
      onPress={onPress}
      style={styles.target}
      testID={testID}
    >
      <View style={[styles.pill, selected ? styles.pillSelected : styles.pillRest]}>
        <ArenaText variant="labelSmall" tone={selected ? 'onAccent' : 'body'}>
          {label}
        </ArenaText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: layout.minTouchTarget, justifyContent: 'center' },
  pill: {
    paddingVertical: space[8],
    paddingHorizontal: space[14],
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillSelected: { backgroundColor: color.accent },
  pillRest: { backgroundColor: color.decorative.fill },
});
