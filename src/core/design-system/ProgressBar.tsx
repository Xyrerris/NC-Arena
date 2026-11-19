/**
 * A thin bar that fills as work advances. The fill grows into place on the UI thread (Reanimated,
 * as `CompareBar` does) so that it keeps moving while the JS thread is busy with the work it reports.
 *
 * It is one accessible element: a screen reader gets the label and the percentage, not the bar.
 */

import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { color, radius, space } from './tokens';

const FILL_DURATION_MS = 420;

export interface ProgressBarProps {
  /** Done over total, 0 to 1; anything outside is held to it. */
  fraction: number;
  /** What the bar measures, as a screen reader says it: "Reading the market, 4 of 10 pieces". */
  accessibilityLabel: string;
  testID?: string;
}

const clamp = (fraction: number): number =>
  Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;

export function ProgressBar({ fraction, accessibilityLabel, testID }: ProgressBarProps) {
  const filled = clamp(fraction);
  // Both halves animate: `flex` splits the track between them, so animating one alone would jump.
  const fillStyle = useAnimatedStyle(
    () => ({
      flex: withTiming(filled, { duration: FILL_DURATION_MS, easing: Easing.out(Easing.cubic) }),
    }),
    [filled],
  );
  const restStyle = useAnimatedStyle(
    () => ({
      flex: withTiming(1 - filled, {
        duration: FILL_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      }),
    }),
    [filled],
  );

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(filled * 100) }}
      style={styles.track}
      testID={testID}
    >
      <Animated.View style={[styles.fill, fillStyle]} />
      <Animated.View style={restStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: space[10],
    borderRadius: radius.pill,
    backgroundColor: color.decorative.track,
    overflow: 'hidden',
  },
  fill: { borderRadius: radius.pill, backgroundColor: color.accent },
});
