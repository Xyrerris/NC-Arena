/**
 * One collection in the list: what it is, where it stands, what it gives, and the one thing
 * the user can do about it.
 *
 * Memoised, and the screen is not (ARCHITECTURE.md §8): `onAction` takes the id so one callback
 * serves the whole list instead of one per row.
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ArenaButton, ArenaText, color, layout, space } from '@/core/design-system';

import type { CollectionRowUi } from './collectionUiState';
import { SkillMark } from './SkillMark';

export interface CollectionRowProps {
  row: CollectionRowUi;
  onAction: (collectionId: number, ticked: boolean) => void;
}

function CollectionRowView({ row, onAction }: CollectionRowProps) {
  return (
    <View style={styles.row} testID={`collection-row-${row.collectionId}`}>
      <View style={styles.titleLine}>
        <ArenaText variant="titleMedium" tone="primary">
          {row.title}
        </ArenaText>
        <ArenaText variant="numericMicro" tone="subtle">
          {row.itemCountLabel}
        </ArenaText>
      </View>

      <ArenaText
        variant="bodySmall"
        tone={row.statusTone}
        testID={`collection-status-${row.collectionId}`}
      >
        {row.statusLabel}
      </ArenaText>

      <ArenaText variant="bodyCaption" tone="subtle">
        {row.bonusText}
      </ArenaText>
      <View style={styles.items}>
        {row.items.map((item) => (
          <View
            key={item.key}
            style={styles.item}
            accessible
            accessibilityLabel={item.a11y}
            testID={`collection-requirement-${row.collectionId}-${item.key}`}
          >
            <SkillMark shown={item.needsSkill} />
            <ArenaText variant="numericMicro" tone="subtle" style={styles.itemText}>
              {item.label}
            </ArenaText>
          </View>
        ))}
      </View>

      {row.action === null ? null : (
        <ArenaButton
          label={row.action.label}
          accessibilityLabel={row.action.a11y}
          variant="secondary"
          onPress={() => onAction(row.collectionId, row.action?.tick ?? false)}
          testID={`collection-action-${row.collectionId}`}
        />
      )}
    </View>
  );
}

export const CollectionRowItem = memo(CollectionRowView);

const styles = StyleSheet.create({
  row: {
    marginHorizontal: layout.screenGutter,
    paddingVertical: space[12],
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
    gap: space[6],
  },
  items: { gap: space[2] },
  item: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  // Takes the rest of the line and wraps inside it, so a long name at 200 % font scale grows the
  // row downward instead of pushing the mark off the edge.
  itemText: { flex: 1 },
  titleLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[8],
  },
});
