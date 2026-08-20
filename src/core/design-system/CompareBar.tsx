/**
 * One row of the Vs You comparison: your value and theirs, as bars and as numbers.
 *
 * Two things are deliberate and both are ROADMAP.md Phase 6 items brought forward, because
 * retrofitting them into a bar chart is more expensive than building them in:
 *
 * - The bars are labelled for a screen reader. The prototype encodes "ahead or behind" in
 *   `c.color` alone, which is invisible to TalkBack and to anyone with a colour deficiency.
 * - The delta carries a word as well as a hue.
 *
 * The delta's *direction* is still the prototype's — a positive delta means the opponent is
 * stronger — and that reads backwards at a glance. It is a product question, not a bug to
 * silently flip; ROADMAP.md Phase 4 owns it.
 */

import { StyleSheet, View } from 'react-native';

import { ArenaText } from './ArenaText';
import { color, radius, space } from './tokens';

export interface CompareBarProps {
  label: string;
  /** Pre-formatted, both representations, for each side. */
  mine: { exact: string; short: string; fraction: number };
  theirs: { exact: string; short: string; fraction: number };
  /** `"+31.2%"`, or `"—"` where the baseline is zero. */
  delta: string;
  /** True when the opponent is stronger on this stat. */
  opponentAhead: boolean;
  testID?: string;
}

const clamp = (fraction: number) => Math.max(0, Math.min(1, fraction));

export function CompareBar({ label, mine, theirs, delta, opponentAhead, testID }: CompareBarProps) {
  const verdict = opponentAhead ? 'they lead' : 'you lead';

  return (
    <View
      accessible
      accessibilityLabel={`${label}. You ${mine.exact}, them ${theirs.exact}. ${verdict}, ${delta}.`}
      style={styles.root}
      testID={testID}
    >
      <View style={styles.header}>
        <ArenaText variant="labelMicro" tone="subtle" style={styles.label}>
          {label}
        </ArenaText>
        <View style={styles.delta}>
          <ArenaText variant="labelSmall" tone={opponentAhead ? 'negative' : 'accent'}>
            {delta}
          </ArenaText>
          <ArenaText variant="bodyCaption" tone="subtle">
            {verdict}
          </ArenaText>
        </View>
      </View>

      <Side
        caption="you"
        exact={mine.exact}
        short={mine.short}
        fraction={mine.fraction}
        fill={color.compare.mine}
      />
      <Side
        caption="them"
        exact={theirs.exact}
        short={theirs.short}
        fraction={theirs.fraction}
        fill={color.compare.theirs}
      />
    </View>
  );
}

interface SideProps {
  caption: string;
  exact: string;
  short: string;
  fraction: number;
  fill: string;
}

function Side({ caption, exact, short, fraction, fill }: SideProps) {
  return (
    <View style={styles.side}>
      <View style={styles.sideHeader}>
        <ArenaText variant="bodyCaption" tone="subtle">
          {caption}
        </ArenaText>
        <View style={styles.sideValues}>
          <ArenaText variant="numericSmall" tone="primary" style={styles.exact}>
            {exact}
          </ArenaText>
          <ArenaText variant="numericTiny" tone="subtle">
            {short}
          </ArenaText>
        </View>
      </View>
      {/* Decorative: the numbers above already carry the information. */}
      <View accessibilityElementsHidden importantForAccessibility="no" style={styles.track}>
        <View style={[styles.fill, { backgroundColor: fill, flex: clamp(fraction) }]} />
        <View style={{ flex: 1 - clamp(fraction) }} />
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
    gap: space[10],
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space[4],
  },
  label: { textTransform: 'uppercase' },
  delta: { flexDirection: 'row', alignItems: 'baseline', gap: space[6] },
  side: { gap: space[4] },
  sideHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    columnGap: space[10],
    rowGap: space[2],
  },
  sideValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space[8],
    rowGap: space[2],
  },
  exact: { flexShrink: 1 },
  track: {
    flexDirection: 'row',
    height: space[6],
    borderRadius: radius.pill,
    backgroundColor: color.decorative.track,
    overflow: 'hidden',
  },
  fill: { borderRadius: radius.pill },
});
