/**
 * The Stats / Vs You control on the detail screen.
 *
 * `accessibilityRole="tab"` inside a `tablist` rather than two buttons: it is what tells a
 * screen reader that picking one deselects the other, which two buttons do not say.
 */

import { StyleSheet, View, Pressable } from 'react-native';

import { ArenaText } from './ArenaText';
import { color, layout, radius, space } from './tokens';

export interface SegmentedTab<TValue extends string> {
  value: TValue;
  label: string;
}

export interface SegmentedTabsProps<TValue extends string> {
  tabs: readonly SegmentedTab<TValue>[];
  selected: TValue;
  onSelect: (value: TValue) => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function SegmentedTabs<TValue extends string>({
  tabs,
  selected,
  onSelect,
  accessibilityLabel = 'View',
  testID,
}: SegmentedTabsProps<TValue>) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={styles.root}
      testID={testID}
    >
      {tabs.map((tab) => {
        const isSelected = tab.value === selected;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            key={tab.value}
            onPress={() => onSelect(tab.value)}
            style={[styles.tab, isSelected && styles.tabSelected]}
          >
            <ArenaText variant="labelSmall" tone={isSelected ? 'accent' : 'subtle'}>
              {tab.label}
            </ArenaText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    backgroundColor: color.decorative.fill,
    borderRadius: radius.pill,
    padding: space[4],
    gap: space[4],
  },
  tab: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space[12],
  },
  tabSelected: { backgroundColor: color.decorative.accentWash },
});
