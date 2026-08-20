/**
 * Your record against a player — "8W · 2L".
 *
 * The colour is the prototype's signal and it is kept, but colour is never the only signal:
 * the accessibility label spells the record out, so TalkBack does not depend on hue
 * (ARCHITECTURE.md §2.4, and the Phase 6 non-colour-redundancy pass builds on this).
 */

import { StyleSheet, View } from 'react-native';

import { ArenaText, type Tone } from './ArenaText';
import { space } from './tokens';

export interface RecordBadgeProps {
  wins: number;
  losses: number;
  testID?: string;
}

const toneFor = (wins: number, losses: number): Tone => {
  if (wins > losses) return 'accent';
  if (wins < losses) return 'negative';
  return 'body';
};

export function RecordBadge({ wins, losses, testID }: RecordBadgeProps) {
  const played = wins + losses;
  const label =
    played === 0 ? 'never fought' : `you won ${wins} of ${played} matches against this player`;

  return (
    <View accessible accessibilityLabel={label} style={styles.root} testID={testID}>
      <ArenaText variant="labelSmall" tone={toneFor(wins, losses)}>
        {`${wins}W · ${losses}L`}
      </ArenaText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
