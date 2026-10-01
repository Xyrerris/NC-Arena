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
      <ArenaText variant="numericMicro" tone="subtle">
        {row.itemsText}
      </ArenaText>

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
  titleLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[8],
  },
});
