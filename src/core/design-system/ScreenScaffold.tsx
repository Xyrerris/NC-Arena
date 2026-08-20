/**
 * Edge-to-edge screen frame. Android 15 draws behind the system bars whether the app asks
 * or not, so the insets are applied as padding here rather than being discovered per screen
 * (ROADMAP.md Phase 1).
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, layout } from './tokens';

export interface ScreenScaffoldProps {
  children: ReactNode;
  /** Set false for a scroll view that should bleed under the navigation bar. */
  applyBottomInset?: boolean;
  style?: ViewStyle;
}

export function ScreenScaffold({ children, applyBottomInset = true, style }: ScreenScaffoldProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: applyBottomInset ? insets.bottom : 0,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.backdrop },
});

export const screenGutter = layout.screenGutter;
