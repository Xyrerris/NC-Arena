/**
 * The upgrade planner (the upgrade plan, phase 5): pick one of your pieces and a level, and see what
 * to buy to reach it from the material on sale. Nothing is bought here: SELECT puts the plan's pieces
 * in the list's selection, and the cart buys them like any other selection.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  planUpgrade,
  type BaseExpByItem,
  type EnhancementCosts,
  type EnhancementExp,
  type EquipmentCatalog,
  type ScoredMaterial,
} from '@/core/collection';
import { ArenaButton, ArenaText, color, layout, radius, space } from '@/core/design-system';

import { clampTarget, pieceLine, planLines, plannablePieces } from './plannerUiState';
import { upgradeStrings as words } from './strings';
import { useOwnedEquipment } from './useOwnedEquipment';

export interface PlannerSheetProps {
  base: BaseExpByItem;
  levels: EnhancementExp;
  catalog: EquipmentCatalog;
  costs: EnhancementCosts;
  /** The offers in range, best first: what the plan buys from. */
  offers: readonly ScoredMaterial[];
  /** The listings of the plan, to be selected in the list. */
  onSelect: (productIds: readonly string[]) => void;
  onClose: () => void;
}

export function PlannerSheet({
  base,
  levels,
  catalog,
  costs,
  offers,
  onSelect,
  onClose,
}: PlannerSheetProps) {
  const bag = useOwnedEquipment(true);
  const pieces = useMemo(
    () => (bag.status === 'ready' ? plannablePieces(bag.equipment, base, levels, catalog) : []),
    [bag, base, levels, catalog],
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [wanted, setWanted] = useState<number | null>(null);

  const chosen = pieces.find((candidate) => candidate.piece.tradableId === chosenId) ?? null;
  const to =
    chosen === null
      ? null
      : clampTarget(wanted ?? chosen.piece.level + 1, chosen.piece.level, chosen.max);
  const plan = useMemo(
    () =>
      chosen === null || to === null
        ? null
        : planUpgrade(
            { itemId: chosen.piece.itemId, level: chosen.piece.level, exp: chosen.piece.exp },
            to,
            offers,
            base,
            levels,
            costs,
          ),
    [chosen, to, offers, base, levels, costs],
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.dismiss}
          onPress={onClose}
          importantForAccessibility="no"
          accessible={false}
        />
        <View style={styles.sheet} accessibilityViewIsModal testID="planner-sheet">
          <View style={styles.header}>
            <ArenaText
              variant="titleMedium"
              tone="primary"
              accessibilityRole="header"
              style={styles.title}
            >
              {words.plannerTitle}
            </ArenaText>
            <ArenaButton
              label={words.plannerClose}
              accessibilityLabel={words.plannerCloseA11y}
              variant="secondary"
              onPress={onClose}
              testID="planner-close"
            />
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {bag.status === 'idle' || bag.status === 'loading' ? (
              <ArenaText variant="bodySmall" tone="subtle" testID="planner-loading">
                {words.plannerReading}
              </ArenaText>
            ) : bag.status === 'no-avatar' ? (
              <ArenaText variant="bodySmall" tone="negative" testID="planner-no-avatar">
                {words.plannerNoAvatar}
              </ArenaText>
            ) : bag.status === 'failed' ? (
              <View style={styles.block}>
                <ArenaText variant="bodySmall" tone="negative" testID="planner-failed">
                  {bag.reason === 'OFFLINE' ? words.plannerOffline : words.plannerFailed}
                </ArenaText>
                <ArenaButton
                  label={words.plannerRetry}
                  variant="secondary"
                  onPress={bag.retry}
                  testID="planner-retry"
                />
              </View>
            ) : pieces.length === 0 ? (
              <ArenaText variant="bodySmall" tone="subtle" testID="planner-none">
                {words.plannerNone}
              </ArenaText>
            ) : (
              <>
                <ArenaText variant="bodySmall" tone="body">
                  {words.plannerPick}
                </ArenaText>
                {pieces.map((candidate) => {
                  const selected = candidate.piece.tradableId === chosenId;
                  return (
                    <Pressable
                      key={candidate.piece.tradableId}
                      style={[styles.piece, selected && styles.pieceSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={words.plannerPieceA11y(candidate.label)}
                      onPress={() => {
                        setChosenId(candidate.piece.tradableId);
                        setWanted(null);
                      }}
                      testID={`planner-piece-${candidate.piece.tradableId}`}
                    >
                      <ArenaText variant="bodyMedium" tone={selected ? 'accent' : 'primary'}>
                        {pieceLine(candidate)}
                      </ArenaText>
                    </Pressable>
                  );
                })}

                {chosen === null || to === null ? null : (
                  <View style={styles.block}>
                    <View style={styles.stepper}>
                      <ArenaButton
                        label={words.plannerLower}
                        accessibilityLabel={words.plannerLowerA11y}
                        variant="secondary"
                        disabled={to <= chosen.piece.level + 1}
                        onPress={() => setWanted(to - 1)}
                        testID="planner-lower"
                      />
                      <ArenaText variant="titleMedium" tone="primary" testID="planner-target">
                        {words.plannerTarget(to)}
                      </ArenaText>
                      <ArenaButton
                        label={words.plannerHigher}
                        accessibilityLabel={words.plannerHigherA11y}
                        variant="secondary"
                        disabled={to >= chosen.max}
                        onPress={() => setWanted(to + 1)}
                        testID="planner-higher"
                      />
                    </View>
                    {plan === null ? null : (
                      <>
                        {planLines(plan).map((line, index) => (
                          <ArenaText
                            key={line}
                            variant="bodySmall"
                            tone="body"
                            testID={`planner-line-${index}`}
                          >
                            {line}
                          </ArenaText>
                        ))}
                        <ArenaButton
                          label={words.planSelect}
                          accessibilityLabel={words.planSelectA11y}
                          disabled={plan.picks.length === 0}
                          onPress={() => {
                            onSelect(plan.picks.map((pick) => pick.listing.productId));
                            onClose();
                          }}
                          testID="planner-select"
                        />
                      </>
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '90%',
    backgroundColor: color.raised,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: color.decorative.hairline,
    paddingTop: space[16],
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
    paddingHorizontal: layout.screenGutter,
  },
  title: { flex: 1 },
  body: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: space[12],
    paddingBottom: space[40],
    gap: space[8],
  },
  block: { gap: space[8], paddingTop: space[8] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  piece: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingVertical: space[4],
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
  },
  pieceSelected: { borderBottomColor: color.decorative.hairline },
});
