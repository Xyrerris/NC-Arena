/**
 * A bar that fills as work advances. The fill grows into place on the UI thread (Reanimated, as
 * `CompareBar` does) so that it keeps moving while the JS thread is busy with the work it reports.
 *
 * It is made to look alive and a little solid: the fill pulses softly, has a light upper half and a
 * darker lower edge, and a glint travels along the track. All of it runs on the UI thread and stops
 * when the person has asked the system for reduced motion — the fill still grows, nothing loops.
 *
 * It is one accessible element: a screen reader gets the label and the percentage, not the bar.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { color, radius, space } from './tokens';

const FILL_DURATION_MS = 420;
const PULSE_DURATION_MS = 900;
const PULSE_LOW = 0.72;
const GLINT_DURATION_MS = 1500;
/** The glint is this share of the track wide. */
const GLINT_SHARE = 0.3;

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
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);

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

  const pulse = useSharedValue(1);
  const glint = useSharedValue(0);
  useEffect(() => {
    if (still) {
      cancelAnimation(pulse);
      cancelAnimation(glint);
      pulse.value = 1;
      glint.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(PULSE_LOW, { duration: PULSE_DURATION_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    glint.value = withRepeat(
      withTiming(1, { duration: GLINT_DURATION_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(glint);
    };
  }, [still, pulse, glint]);

  // The filled share as it is drawn, on the same timing as the fill, so the glint follows its edge.
  const drawn = useSharedValue(filled);
  useEffect(() => {
    drawn.value = withTiming(filled, {
      duration: FILL_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [filled, drawn]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  // The glint lives inside the fill, which clips it: it crosses the filled part only.
  const glintStyle = useAnimatedStyle(() => {
    const fillWidth = width * drawn.value;
    const glintWidth = fillWidth * GLINT_SHARE;
    return {
      width: glintWidth,
      opacity: still ? 0 : 1,
      transform: [{ translateX: -glintWidth + glint.value * (fillWidth + glintWidth) }],
    };
  });

  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(filled * 100) }}
      style={styles.track}
      onLayout={onLayout}
      testID={testID}
    >
      <Animated.View style={[styles.fill, fillStyle]}>
        <Animated.View style={[styles.fillBody, pulseStyle]}>
          <View style={styles.sheen} />
          <View style={styles.shade} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.glint, glintStyle]} />
      </Animated.View>
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
  fill: { borderRadius: radius.pill, overflow: 'hidden' },
  fillBody: { flex: 1, backgroundColor: color.accent },
  /** The light upper half of the fill. */
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: color.decorative.sheen,
  },
  /** The darker lower edge. */
  shade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '25%',
    backgroundColor: color.decorative.shade,
  },
  glint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: color.decorative.sheen,
  },
});
