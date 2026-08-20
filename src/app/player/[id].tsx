import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ArenaText, ScreenScaffold, layout, space } from '@/core/design-system';

/**
 * Player detail route.
 *
 * Still a scaffold. Phase 4 replaces the body with <PlayerDetailScreen />.
 *
 * Note for Phase 4: `id` arrives as a plain string. This file is the one place that
 * brands it into a PlayerId (ARCHITECTURE.md §5), and it must do so only after
 * confirming the row exists — file-based routing makes `player/<unknown-id>` a
 * reachable URL, which is a Phase 4 exit criterion.
 */
export default function PlayerDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ScreenScaffold>
      <View style={styles.body}>
        <ArenaText variant="displayMedium" tone="primary">
          Player detail
        </ArenaText>
        <ArenaText variant="numericSmall" tone="subtle">
          {`id: ${id}`}
        </ArenaText>
        <ArenaText variant="bodySmall" tone="subtle">
          Phase 0 scaffold. Stats and Vs You land in Phase 4.
        </ArenaText>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenGutter,
    gap: space[12],
  },
});
