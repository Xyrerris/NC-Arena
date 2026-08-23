/**
 * The roster (ARCHITECTURE.md §1, "Roster"). Title and season, the registered count, your
 * avatar's hero card, search, three sort chips, and the ladder.
 *
 * Two structural choices worth naming, because neither is what the prototype does:
 *
 * - **The header does not scroll with the list.** It is a sibling of the `FlashList`, not
 *   its `ListHeaderComponent`. A `TextInput` inside a virtualised list's header is a
 *   recycled cell, and recycling it while it holds focus drops the keyboard mid-word.
 * - **The header survives an empty result.** Searching for a player who is not there
 *   leaves the search field, the chips and your card exactly where they were, and replaces
 *   only the list. The prototype renders a blank screen instead (defect 5).
 */

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  ArenaText,
  ScreenScaffold,
  SearchField,
  SortChip,
  ViewerCard,
  color,
  layout,
  space,
} from '@/core/design-system';
import type { PlayerId, RosterSort } from '@/core/model';

import { RosterRow } from './RosterRow';
import {
  SORT_OPTIONS,
  playerCountLabel,
  type RosterHeaderUi,
  type RosterRowUi,
  type RosterUiState,
} from './rosterUiState';
import { useDebouncedValue } from './useDebouncedValue';
import { useRoster } from './useRoster';

export function RosterScreen() {
  const { state, onEvent } = useRoster();
  const router = useRouter();

  // Local, and immediate. Only the settled value reaches SQL (ARCHITECTURE.md §8).
  const [input, setInput] = useState('');
  const settledQuery = useDebouncedValue(input);

  useEffect(() => {
    onEvent({ type: 'search', query: settledQuery });
  }, [settledQuery, onEvent]);

  const openPlayer = useCallback(
    (id: PlayerId) => router.push({ pathname: '/player/[id]', params: { id } }),
    [router],
  );
  const selectSort = useCallback((sort: RosterSort) => onEvent({ type: 'sort', sort }), [onEvent]);
  const retry = useCallback(() => onEvent({ type: 'refresh' }), [onEvent]);

  const header = state.kind === 'ready' || state.kind === 'empty' ? state.header : null;

  return (
    <ScreenScaffold applyBottomInset={false}>
      {header === null ? null : (
        <RosterHeader
          header={header}
          input={input}
          onChangeInput={setInput}
          onSelectSort={selectSort}
        />
      )}
      <RosterBody state={state} onOpenPlayer={openPlayer} onRetry={retry} />
    </ScreenScaffold>
  );
}

interface RosterHeaderProps {
  header: RosterHeaderUi;
  input: string;
  onChangeInput: (next: string) => void;
  onSelectSort: (sort: RosterSort) => void;
}

function RosterHeader({ header, input, onChangeInput, onSelectSort }: RosterHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <ArenaText variant="displayMedium" tone="primary" accessibilityRole="header">
          Arena
        </ArenaText>
        {header.seasonLabel === null ? null : (
          <ArenaText variant="numericMicro" tone="accent" testID="roster-season">
            {header.seasonLabel}
          </ArenaText>
        )}
      </View>

      <ArenaText variant="bodySmall" tone="subtle" testID="roster-count">
        {playerCountLabel(header.totalPlayers)}
      </ArenaText>

      {header.viewer === null ? null : (
        <ViewerCard
          testID="viewer-card"
          name={header.viewer.name}
          rank={header.viewer.rank}
          score={header.viewer.score}
          combatPowerExact={header.viewer.combatPowerExact}
          combatPowerShort={header.viewer.combatPowerShort}
        />
      )}

      <SearchField value={input} onChangeText={onChangeInput} testID="roster-search" />

      <View style={styles.chips}>
        {SORT_OPTIONS.map((option) => (
          <SortChip
            key={option.sort}
            label={option.label}
            selected={header.sort === option.sort}
            onPress={() => onSelectSort(option.sort)}
            testID={`roster-sort-${option.sort}`}
          />
        ))}
      </View>
    </View>
  );
}

interface RosterBodyProps {
  state: RosterUiState;
  onOpenPlayer: (id: PlayerId) => void;
  onRetry: () => void;
}

function RosterBody({ state, onOpenPlayer, onRetry }: RosterBodyProps) {
  switch (state.kind) {
    case 'loading':
      return (
        <View style={styles.centred} testID="roster-loading">
          <ActivityIndicator color={color.accent} />
          <ArenaText variant="bodySmall" tone="subtle">
            Reading the ladder…
          </ArenaText>
        </View>
      );

    case 'error':
      return (
        <View style={styles.centred} testID="roster-error">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            The ladder could not be read
          </ArenaText>
          <ArenaText variant="bodySmall" tone="negative" align="center">
            {state.message}
          </ArenaText>
          {state.canRetry ? (
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
              <ArenaText variant="labelStrong" tone="accent">
                TRY AGAIN
              </ArenaText>
            </Pressable>
          ) : null}
        </View>
      );

    case 'empty':
    case 'ready':
      // One list for both, with the empty message inside it rather than in place of it.
      // Swapping the `FlashList` out on every fruitless keystroke would tear down and
      // rebuild a recycler for a message — and the header above it is a sibling precisely
      // so that it does not move when this does.
      return (
        <FlashList
          data={state.kind === 'ready' ? state.rows : NO_ROWS}
          extraData={state.header.sort}
          keyExtractor={(row) => row.id}
          renderItem={({ item }) => <RosterRow row={item} onPress={onOpenPlayer} />}
          ListEmptyComponent={<RosterEmpty query={state.kind === 'empty' ? state.query : ''} />}
          contentContainerStyle={styles.list}
          testID="roster-list"
        />
      );
  }
}

/** Nothing matched. The prototype renders a blank screen here (defect 5). */
function RosterEmpty({ query }: { query: string }) {
  const needle = query.trim();
  return (
    <View style={styles.centred} testID="roster-empty">
      <ArenaText variant="titleMedium" tone="primary" align="center">
        {needle === '' ? 'No players yet' : 'No player by that name'}
      </ArenaText>
      <ArenaText variant="bodySmall" tone="subtle" align="center">
        {needle === ''
          ? 'The ladder is empty. Pull the roster again once the season opens.'
          : `Nothing in the roster matches "${needle}".`}
      </ArenaText>
    </View>
  );
}

/** Stable identity, so an empty list is not a new prop on every render. */
const NO_ROWS: readonly RosterRowUi[] = [];

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: space[6],
    gap: space[12],
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[8],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  list: { paddingBottom: space[40] },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
    gap: space[12],
  },
  retry: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: space[20],
  },
});
