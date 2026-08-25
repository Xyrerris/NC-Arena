/**
 * "Your avatar" — the hero card at the top of the roster.
 *
 * The viewer is a row in the same ranked list as everyone else (ADR-0008), so this card
 * takes the rank it is given rather than owning one. That is the whole fix for the
 * prototype's rank-12-inside-a-14-player-roster: there is nowhere left to put a second
 * ranking.
 */

import { StyleSheet, View } from 'react-native';

import { ArenaText } from './ArenaText';
import { RecordBadge } from './RecordBadge';
import { color, radius, space } from './tokens';

export interface ViewerCardProps {
  name: string;
  /** Pre-formatted: `"2.145.880"` and `"2,15 M"`. */
  combatPowerExact: string;
  combatPowerShort: string;
  rank: number;
  score: number;
  record?: { wins: number; losses: number };
  testID?: string;
}

export function ViewerCard({
  name,
  combatPowerExact,
  combatPowerShort,
  rank,
  score,
  record,
  testID,
}: ViewerCardProps) {
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <ArenaText variant="labelNano" tone="accent" style={styles.eyebrow}>
            YOUR AVATAR
          </ArenaText>
          <ArenaText variant="titleLarge" tone="primary">
            {name}
          </ArenaText>
        </View>
        <View accessible accessibilityLabel={`Rank ${rank}`} style={styles.rank}>
          <ArenaText variant="labelNano" tone="subtle">
            RANK
          </ArenaText>
          <ArenaText variant="numericLarge" tone="accent">
            {String(rank).padStart(2, '0')}
          </ArenaText>
        </View>
      </View>

      <View accessible accessibilityLabel={`Combat power ${combatPowerExact}`} style={styles.power}>
        <ArenaText variant="labelNano" tone="subtle" style={styles.eyebrow}>
          COMBAT POWER
        </ArenaText>
        <View style={styles.powerValues}>
          <ArenaText variant="numericHero" tone="primary" style={styles.powerExact}>
            {combatPowerExact}
          </ArenaText>
          <ArenaText variant="numericTiny" tone="subtle">
            {combatPowerShort}
          </ArenaText>
        </View>
      </View>

      <View style={styles.footer}>
        <ArenaText variant="bodyCaption" tone="subtle">
          {`Score ${score}`}
        </ArenaText>
        {record ? <RecordBadge wins={record.wins} losses={record.losses} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: color.raised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.decorative.accentEdge,
    padding: space[18],
    gap: space[16],
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space[12],
  },
  identity: { gap: space[4], flexShrink: 1 },
  eyebrow: { textTransform: 'uppercase' },
  rank: { alignItems: 'flex-end', gap: space[2] },
  power: { gap: space[4] },
  powerValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space[10],
    rowGap: space[2],
  },
  powerExact: { flexShrink: 1 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[8],
  },
});
