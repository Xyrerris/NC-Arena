/**
 * The player detail screen (ARCHITECTURE.md §1, "Player detail"): rank, name, combat power
 * shown twice, and two tabs — the raw stat book, and the comparison against your avatar.
 *
 * The back affordance is a real control rather than decoration. Android's predictive back
 * is enabled for the whole app (`app.config.ts`), and a gesture that animates a screen away
 * while the only visible way out is a chevron that does something *else* is worse than
 * having no chevron at all — so this one resolves to the same destination the gesture does.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  ArenaButton,
  ArenaText,
  CompareBar,
  RecordBadge,
  ScreenScaffold,
  SegmentedTabs,
  StatRow,
  color,
  layout,
  radius,
  space,
} from '@/core/design-system';
import type { PlayerId } from '@/core/model';

import {
  DETAIL_TABS,
  STATS_FOOTER,
  type PlayerDetailTab,
  type PlayerDetailUiState,
  type PlayerHeaderUi,
  type StatRowUi,
  type VersusUi,
} from './playerDetailUiState';
import { usePlayerDetail } from './usePlayerDetail';

export interface PlayerDetailScreenProps {
  id: PlayerId;
}

export function PlayerDetailScreen({ id }: PlayerDetailScreenProps) {
  const { state, onEvent } = usePlayerDetail(id);
  const router = useRouter();

  // A deep link into this screen has no history behind it, so `back()` would leave the app
  // entirely. Replacing with the roster is what the visible chevron promises, and it keeps
  // the gesture and the button agreeing on where "back" goes.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const selectTab = useCallback(
    (tab: PlayerDetailTab) => onEvent({ type: 'selectTab', tab }),
    [onEvent],
  );
  const retry = useCallback(() => onEvent({ type: 'refresh' }), [onEvent]);

  const edit = useCallback(
    () => router.push({ pathname: '/player/edit/[id]', params: { id } }),
    [router, id],
  );

  return (
    <ScreenScaffold applyBottomInset={false}>
      <View style={styles.backRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the roster"
          onPress={goBack}
          style={styles.back}
          testID="player-back"
        >
          <ArenaText variant="labelStrong" tone="accent">
            {'← ROSTER'}
          </ArenaText>
        </Pressable>

        {/*
          Only for a player this device added. A synced row would have any edit overwritten
          by the next refresh, so there is nothing here to press (ADR-0020).
        */}
        {state.kind === 'ready' && state.canEdit ? (
          <ArenaButton
            label="Edit"
            variant="secondary"
            onPress={edit}
            accessibilityLabel="Edit this player"
            testID="player-edit"
          />
        ) : null}
      </View>

      <DetailBody state={state} onSelectTab={selectTab} onRetry={retry} />
    </ScreenScaffold>
  );
}

interface DetailBodyProps {
  state: PlayerDetailUiState;
  onSelectTab: (tab: PlayerDetailTab) => void;
  onRetry: () => void;
}

function DetailBody({ state, onSelectTab, onRetry }: DetailBodyProps) {
  switch (state.kind) {
    case 'loading':
      return (
        <View style={styles.centred} testID="player-loading">
          <ActivityIndicator color={color.accent} />
          <ArenaText variant="bodySmall" tone="subtle">
            {'Reading the stat book…'}
          </ArenaText>
        </View>
      );

    case 'notFound':
      return (
        <View style={styles.centred} testID="player-not-found">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            No such player
          </ArenaText>
          <ArenaText variant="bodySmall" tone="subtle" align="center">
            This link points at someone who is not on the ladder. They may have left the season, or
            the link may be stale.
          </ArenaText>
        </View>
      );

    case 'error':
      return (
        <View style={styles.centred} testID="player-error">
          <ArenaText variant="titleMedium" tone="primary" align="center">
            The stat book could not be read
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

    case 'ready':
      return (
        <ScrollView contentContainerStyle={styles.scroll} testID="player-detail">
          <DetailHeader header={state.header} />
          <SegmentedTabs
            tabs={DETAIL_TABS}
            selected={state.tab}
            onSelect={onSelectTab}
            accessibilityLabel="Stats or comparison"
            testID="player-tabs"
          />
          {state.tab === 'STATS' ? (
            <StatsTab stats={state.stats} />
          ) : (
            <VersusTab versus={state.versus} />
          )}
        </ScrollView>
      );
  }
}

function DetailHeader({ header }: { header: PlayerHeaderUi }) {
  return (
    <View style={styles.header}>
      <ArenaText variant="labelNano" tone="subtle" testID="player-rank">
        {header.rankLabel}
      </ArenaText>
      <ArenaText variant="displayName" tone="primary" accessibilityRole="header">
        {header.name}
      </ArenaText>
      {header.identityLabel === null ? null : (
        <ArenaText variant="bodyCaption" tone="subtle" testID="player-identity">
          {header.identityLabel}
        </ArenaText>
      )}
      <View
        accessible
        accessibilityLabel={`Combat power ${header.combatPowerExact}`}
        style={styles.power}
      >
        <ArenaText variant="labelNano" tone="subtle">
          CP
        </ArenaText>
        <ArenaText variant="numericHero" tone="accent" style={styles.powerExact}>
          {header.combatPowerExact}
        </ArenaText>
        <ArenaText variant="bodyCaption" tone="subtle">
          {header.combatPowerShort}
        </ArenaText>
      </View>
    </View>
  );
}

function StatsTab({ stats }: { stats: readonly StatRowUi[] }) {
  return (
    <View style={styles.tab} testID="player-stats-tab">
      {stats.map((stat) => (
        <StatRow
          key={stat.key}
          label={stat.label}
          exact={stat.exact}
          short={stat.short}
          testID={`stat-${stat.key}`}
        />
      ))}
      <ArenaText variant="numericSmall" tone="subtle">
        {STATS_FOOTER}
      </ArenaText>
    </View>
  );
}

function VersusTab({ versus }: { versus: VersusUi | null }) {
  if (versus === null) {
    // No avatar yet (open decision 3). The Stats tab beside this one is fully readable, so
    // this is a missing comparison rather than a broken screen.
    return (
      <View style={styles.tab} testID="player-versus-tab">
        <ArenaText variant="titleMedium" tone="primary">
          No avatar to compare against
        </ArenaText>
        <ArenaText variant="bodySmall" tone="subtle">
          Once the roster knows which player is yours, this tab compares the two of you stat by
          stat.
        </ArenaText>
      </View>
    );
  }

  return (
    <View style={styles.tab} testID="player-versus-tab">
      <View style={styles.h2h} testID="player-head-to-head">
        <View style={styles.h2hText}>
          <ArenaText variant="labelNano" tone="subtle">
            HEAD TO HEAD
          </ArenaText>
          <ArenaText variant="bodySmall" tone="body">
            {versus.headToHead.note}
          </ArenaText>
        </View>
        {versus.headToHead.record === null ? null : (
          <RecordBadge
            wins={versus.headToHead.record.wins}
            losses={versus.headToHead.record.losses}
          />
        )}
      </View>

      {versus.rows.map((row) => (
        <CompareBar
          key={row.key}
          label={row.label}
          mine={row.mine}
          theirs={row.theirs}
          delta={row.delta}
          opponentAhead={row.opponentAhead}
          testID={`compare-${row.key}`}
        />
      ))}

      <ArenaText variant="numericSmall" tone="subtle" testID="player-verdict">
        {versus.verdict}
      </ArenaText>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
    paddingHorizontal: layout.screenGutter,
  },
  back: { minHeight: layout.minTouchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: space[40],
    gap: space[20],
  },
  header: { gap: space[8] },
  power: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space[10],
    rowGap: space[2],
  },
  powerExact: { flexShrink: 1 },
  tab: { gap: space[10] },
  h2h: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[12],
    padding: space[16],
    backgroundColor: color.raised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.decorative.hairline,
  },
  h2hText: { gap: space[6], flexShrink: 1 },
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
