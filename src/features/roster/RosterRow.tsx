/**
 * One player in the ladder.
 *
 * Memoised, and the screen is not (ARCHITECTURE.md §8): every row re-renders on every list
 * update otherwise, and the roster is the surface where that shows. `onPress` takes the id
 * so the callback stays stable across the whole list rather than being rebuilt per row.
 *
 * The whole row is one accessibility node with one label. Left ungrouped it is five swipe
 * stops per player, which on a 15-player ladder is 75 stops to reach the bottom — the
 * grouping ROADMAP.md Phase 6 asks for, done here because building it in costs nothing and
 * retrofitting it costs a pass over every screen.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArenaText, RecordBadge, color, layout, space } from '@/core/design-system';
import type { PlayerId } from '@/core/model';

import type { RosterRowUi } from './rosterUiState';

export interface RosterRowProps {
  row: RosterRowUi;
  onPress: (id: PlayerId) => void;
}

const announce = (row: RosterRowUi): string => {
  const record =
    row.record === null ? '' : `, your record ${row.record.wins} wins ${row.record.losses} losses`;
  const you = row.isViewer ? ', your avatar' : '';
  // Announced but not drawn — see the note on `RosterRowUi.isLocal`. A row the user can
  // edit and one they cannot must not be indistinguishable to a screen reader just because
  // the design has no badge for the difference yet.
  const added = row.isLocal ? ', added on this device' : '';
  return `Rank ${Number(row.rankLabel)}, ${row.name}${you}${added}, combat power ${row.combatPowerExact}, ${row.scoreLabel}${record}`;
};

export const RosterRow = memo(function RosterRow({ row, onPress }: RosterRowProps) {
  return (
    <Pressable
      accessibilityLabel={announce(row)}
      accessibilityRole="button"
      onPress={() => onPress(row.id)}
      style={[styles.root, row.isViewer && styles.viewerRow]}
      testID={`roster-row-${row.id}`}
    >
      <ArenaText variant="numericMedium" tone="accent" style={styles.rank} testID="roster-row-rank">
        {row.rankLabel}
      </ArenaText>

      <View style={styles.identity}>
        <ArenaText variant="titleMedium" tone="primary" testID="roster-row-name">
          {row.name}
        </ArenaText>
        <ArenaText variant="numericSmall" tone="subtle">
          {`CP ${row.combatPowerExact}`}
        </ArenaText>
      </View>

      <View style={styles.trailing}>
        {row.record === null ? null : (
          <RecordBadge wins={row.record.wins} losses={row.record.losses} />
        )}
        <ArenaText variant="bodyCaption" tone="subtle">
          {row.scoreLabel}
        </ArenaText>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[14],
    paddingVertical: space[16],
    paddingHorizontal: layout.screenGutter,
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
    // The row is already taller than this at every font scale; the floor is here so a
    // future compact variant cannot quietly drop below the touch minimum.
    minHeight: layout.minTouchTarget,
  },
  /** The viewer is a row like anyone else (ADR-0008) — marked, not lifted out. */
  viewerRow: { backgroundColor: color.decorative.accentWashFaint },
  rank: { minWidth: space[28] },
  identity: { flex: 1, gap: space[4] },
  trailing: { alignItems: 'flex-end', gap: space[6] },
});
