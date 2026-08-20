/**
 * One stat, shown twice — the exact value and the rounded one. The design's own footer
 * promises "exact value left · rounded value right", so both props are required: there is
 * no way to build a StatRow that shows only half of the product's core idea.
 *
 * Both values arrive pre-formatted. The component never formats, never rounds, and never
 * sees a number, so the §6 contract stays in one tested module (ARCHITECTURE.md §4).
 */

import { StyleSheet, View } from 'react-native';

import { ArenaText } from './ArenaText';
import { color, radius, space } from './tokens';

export interface StatRowProps {
  label: string;
  /** `"2,418,904,113"` — the whole number, never ellipsised. */
  exact: string;
  /** `"2.42 B"` */
  short: string;
  testID?: string;
}

export function StatRow({ label, exact, short, testID }: StatRowProps) {
  return (
    // One swipe stop per stat rather than three, which is the Phase 6 grouping requirement
    // done up front — it costs nothing here and is a rewrite later.
    <View accessible accessibilityLabel={`${label}, ${exact}`} style={styles.root} testID={testID}>
      <ArenaText variant="labelMicro" tone="subtle" style={styles.label}>
        {label}
      </ArenaText>
      <View style={styles.values}>
        <ArenaText variant="numericMedium" tone="primary" style={styles.exact}>
          {exact}
        </ArenaText>
        <ArenaText variant="numericTiny" tone="subtle">
          {short}
        </ArenaText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: space[12],
    paddingHorizontal: space[16],
    backgroundColor: color.raised,
    borderRadius: radius.md,
    gap: space[6],
  },
  label: { textTransform: 'uppercase' },
  // Wraps rather than truncates: at 200 % font scale the exact value takes the full width
  // and the short form moves under it. Ellipsising the number would break the promise the
  // row exists to keep (ARCHITECTURE.md §2.5).
  values: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space[10],
    rowGap: space[2],
  },
  exact: { flexShrink: 1 },
});
