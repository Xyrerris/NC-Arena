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
 *
 * ## The swipe (ADR-0027)
 *
 * Dragging the row **left** records a win against that player and **right** records a loss.
 * Three things about it are deliberate:
 *
 * - **It is not the only way.** The same two acts are `accessibilityActions`, because a
 *   horizontal drag is invisible to TalkBack and unavailable to anyone using a switch. The
 *   actions are also what the tests drive: a gesture needs a touch pipeline no Node
 *   renderer has, so a test that "swiped" would be a test of the mock.
 * - **It activates late.** The row lives inside a vertically scrolling list, so the pan
 *   claims the touch only after a clearly horizontal movement and gives up entirely on a
 *   vertical one. Otherwise every scroll that began on a row would fight it.
 * - **It commits on distance, not on velocity.** A drag that ends short of
 *   `COMMIT_DISTANCE` springs back having written nothing, which is the only undo an
 *   increment has.
 */

import { memo, useCallback, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ArenaText, RecordBadge, color, layout, space } from '@/core/design-system';
import type { MatchOutcome, PlayerId } from '@/core/model';

import type { RosterRowUi } from './rosterUiState';

export interface RosterRowProps {
  row: RosterRowUi;
  onPress: (id: PlayerId) => void;
  /** One match, from the swipe or from the row's accessibility action. */
  onRecord: (id: PlayerId, outcome: MatchOutcome) => void;
}

/** How far the row must travel before letting go counts as a result. */
const COMMIT_DISTANCE = 96;

/** ...and how far it can be dragged at all, so the row never leaves the screen. */
const MAX_TRAVEL = 132;

/**
 * How far a finger may wander before the pan takes the touch from the list's scroll. Small
 * enough that a deliberate sideways drag feels immediate, large enough that a thumb rolling
 * off a vertical flick does not record a match.
 */
const ACTIVATION_SLOP = 16;

const RETURN_MS = 180;

const RECORD_ACTIONS: readonly AccessibilityActionInfo[] = [
  { name: 'recordWin', label: 'Record a win against this player' },
  { name: 'recordLoss', label: 'Record a loss against this player' },
];

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

export const RosterRow = memo(function RosterRow({ row, onPress, onRecord }: RosterRowProps) {
  const travel = useSharedValue(0);

  const record = useCallback(
    (outcome: MatchOutcome) => onRecord(row.id, outcome),
    [onRecord, row.id],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(row.canRecord)
        .activeOffsetX([-ACTIVATION_SLOP, ACTIVATION_SLOP])
        .failOffsetY([-ACTIVATION_SLOP, ACTIVATION_SLOP])
        .onChange((event) => {
          travel.value = clamp(travel.value + event.changeX, -MAX_TRAVEL, MAX_TRAVEL);
        })
        .onEnd(() => {
          if (travel.value <= -COMMIT_DISTANCE) runOnJS(record)('WIN');
          else if (travel.value >= COMMIT_DISTANCE) runOnJS(record)('LOSS');
        })
        // `onFinalize` rather than the end of `onEnd`, so a gesture the system cancels
        // mid-drag — an incoming call, a navigation — still puts the row back.
        .onFinalize(() => {
          travel.value = withTiming(0, { duration: RETURN_MS });
        }),
    [row.canRecord, record, travel],
  );

  const slider = useAnimatedStyle(() => ({ transform: [{ translateX: travel.value }] }));

  // Each label fades in with the drag that reveals it and is fully opaque exactly when
  // letting go would commit — so the row says what it is about to do before it does it.
  const winAction = useAnimatedStyle(() => ({
    opacity: travel.value < 0 ? Math.min(-travel.value / COMMIT_DISTANCE, 1) : 0,
  }));
  const lossAction = useAnimatedStyle(() => ({
    opacity: travel.value > 0 ? Math.min(travel.value / COMMIT_DISTANCE, 1) : 0,
  }));

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'recordWin') record('WIN');
      else if (event.nativeEvent.actionName === 'recordLoss') record('LOSS');
    },
    [record],
  );

  return (
    <View style={styles.root}>
      {row.canRecord ? (
        // Behind the row and inert: the labels are what the drag uncovers, and a screen
        // reader reaches the same two acts through the actions on the row itself.
        <View style={styles.actions} pointerEvents="none" importantForAccessibility="no">
          <Animated.View style={[styles.action, lossAction]}>
            <ArenaText variant="labelStrong" tone="negative" testID={`roster-row-loss-${row.id}`}>
              {'+1 LOSS'}
            </ArenaText>
          </Animated.View>
          <Animated.View style={[styles.action, winAction]}>
            <ArenaText variant="labelStrong" tone="accent" testID={`roster-row-win-${row.id}`}>
              {'+1 WIN'}
            </ArenaText>
          </Animated.View>
        </View>
      ) : null}

      <GestureDetector gesture={pan}>
        {/* Opaque, so the two labels below show only through the gap the drag opens. */}
        <Animated.View style={[styles.slider, slider]}>
          <Pressable
            accessibilityLabel={announce(row)}
            accessibilityRole="button"
            accessibilityHint={
              row.canRecord ? 'Swipe left to add a win, right to add a loss.' : undefined
            }
            accessibilityActions={row.canRecord ? RECORD_ACTIONS : undefined}
            onAccessibilityAction={row.canRecord ? onAccessibilityAction : undefined}
            onPress={() => onPress(row.id)}
            style={[styles.pressable, row.isViewer && styles.viewerRow]}
            testID={`roster-row-${row.id}`}
          >
            <ArenaText
              variant="numericMedium"
              tone="accent"
              style={styles.rank}
              testID="roster-row-rank"
            >
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
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { backgroundColor: color.backdrop },
  actions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenGutter,
  },
  action: { justifyContent: 'center' },
  slider: { backgroundColor: color.backdrop },
  pressable: {
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
