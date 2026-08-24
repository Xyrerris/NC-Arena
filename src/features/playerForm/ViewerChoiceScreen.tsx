/**
 * "Who are you?" — the half of the viewer screen that answers *which* player you are
 * (ADR-0022).
 *
 * It picks from rows that already exist and offers no name field, because inventing a
 * player here would answer open decision 3 twice over: once as an identity, once as a
 * roster entry nobody asked for. An empty roster is therefore sent to the add-player form
 * rather than being given a shortcut of its own.
 *
 * A `FlashList` rather than a `ScrollView` for the same reason the roster uses one — this
 * is the roster, filtered by nothing.
 */

import { FlashList } from '@shopify/flash-list';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  ArenaButton,
  ArenaText,
  ScreenScaffold,
  color,
  layout,
  radius,
  space,
} from '@/core/design-system';
import type { PlayerId } from '@/core/model';

import { useViewerChoice } from './useViewerChoice';
import {
  candidateLabel,
  type ViewerCandidateUi,
  type ViewerChoiceUiState,
} from './viewerChoiceUiState';

export interface ViewerChoiceScreenProps {
  /** Called once a player has been stored as the viewer. */
  onChosen: () => void;
  /** Leaves without choosing. Absent when there is no viewer to fall back to. */
  onCancel?: () => void;
  onAddPlayer: () => void;
}

export function ViewerChoiceScreen({ onChosen, onCancel, onAddPlayer }: ViewerChoiceScreenProps) {
  const { state, onChoose } = useViewerChoice({ onChosen });

  return (
    <ScreenScaffold applyBottomInset={false}>
      <View style={styles.header}>
        {onCancel === undefined ? null : (
          <View style={styles.backRow}>
            <ArenaButton
              label="Cancel"
              variant="secondary"
              onPress={onCancel}
              accessibilityLabel="Cancel and keep the current avatar"
              testID="viewer-choice-cancel"
            />
          </View>
        )}

        <ArenaText variant="displaySmall" tone="primary" accessibilityRole="header">
          Who are you?
        </ArenaText>
        <ArenaText variant="bodySmall" tone="subtle">
          Pick your own player. The roster marks them as your avatar, and their stats become the
          ones every comparison is made against.
        </ArenaText>
      </View>

      <ChoiceBody state={state} onChoose={onChoose} onAddPlayer={onAddPlayer} />
    </ScreenScaffold>
  );
}

interface ChoiceBodyProps {
  state: ViewerChoiceUiState;
  onChoose: (id: PlayerId) => void;
  onAddPlayer: () => void;
}

function ChoiceBody({ state, onChoose, onAddPlayer }: ChoiceBodyProps) {
  switch (state.kind) {
    case 'loading':
      return (
        <View style={styles.centred} testID="viewer-choice-loading">
          <ActivityIndicator color={color.accent} />
          <ArenaText variant="bodySmall" tone="subtle">
            {'Reading the ladder…'}
          </ArenaText>
        </View>
      );

    case 'error':
      return (
        <View style={styles.centred} testID="viewer-choice-error">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            The ladder could not be read
          </ArenaText>
          <ArenaText variant="bodySmall" tone="negative" align="center">
            {state.message}
          </ArenaText>
        </View>
      );

    case 'empty':
      return (
        <View style={styles.centred} testID="viewer-choice-empty">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            Nobody to pick yet
          </ArenaText>
          <ArenaText variant="bodySmall" tone="subtle" align="center">
            Add yourself to the roster first — then come back and say which player you are.
          </ArenaText>
          <ArenaButton
            label="+ New player"
            onPress={onAddPlayer}
            accessibilityLabel="Add a player to the roster"
            testID="viewer-choice-add-player"
          />
        </View>
      );

    case 'ready':
      return (
        <>
          {state.message === null ? null : (
            <View style={styles.banner} testID="viewer-choice-message">
              <ArenaText variant="bodySmall" tone="negative">
                {state.message}
              </ArenaText>
            </View>
          )}
          <FlashList
            data={state.candidates}
            keyExtractor={(candidate) => candidate.id}
            renderItem={({ item }) => <CandidateRow candidate={item} onPress={onChoose} />}
            contentContainerStyle={styles.list}
            testID="viewer-choice-list"
          />
        </>
      );
  }
}

const CandidateRow = memo(function CandidateRow({
  candidate,
  onPress,
}: {
  candidate: ViewerCandidateUi;
  onPress: (id: PlayerId) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={candidateLabel(candidate)}
      accessibilityRole="button"
      // The current choice is a selected control, not merely a tinted one — the tint is
      // invisible to a screen reader and to anyone who cannot separate the two greens.
      accessibilityState={{ selected: candidate.isCurrent }}
      onPress={() => onPress(candidate.id)}
      style={[styles.row, candidate.isCurrent && styles.currentRow]}
      testID={`viewer-choice-row-${candidate.id}`}
    >
      <ArenaText variant="numericMedium" tone="accent" style={styles.rank}>
        {candidate.rankLabel}
      </ArenaText>

      <View style={styles.identity}>
        <ArenaText variant="titleMedium" tone="primary">
          {candidate.name}
        </ArenaText>
        <ArenaText variant="numericSmall" tone="subtle">
          {`CP ${candidate.combatPowerExact}`}
        </ArenaText>
      </View>

      {candidate.isCurrent ? (
        <ArenaText variant="labelNano" tone="accent">
          THIS IS YOU
        </ArenaText>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: space[6],
    gap: space[8],
  },
  backRow: { alignItems: 'flex-start' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[14],
    paddingVertical: space[16],
    paddingHorizontal: layout.screenGutter,
    borderBottomWidth: 1,
    borderBottomColor: color.decorative.divider,
    minHeight: layout.minTouchTarget,
  },
  currentRow: { backgroundColor: color.decorative.accentWashFaint },
  rank: { minWidth: space[28] },
  identity: { flex: 1, gap: space[4] },
  list: { paddingBottom: space[40] },
  banner: {
    marginHorizontal: layout.screenGutter,
    marginTop: space[12],
    padding: space[12],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.negative,
    backgroundColor: color.decorative.fill,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
    gap: space[12],
  },
});
