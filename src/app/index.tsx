import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ArenaText, ScreenScaffold, layout, space } from '@/core/design-system';

/**
 * Roster route.
 *
 * Still a scaffold — Phase 3 replaces the body with <RosterScreen /> from features/roster
 * and this file stays thin (ARCHITECTURE.md §4). Phase 1 replaced its literal colours and
 * spacing with tokens, which is why there is not a hex code left in it.
 */
export default function RosterRoute() {
  return (
    <ScreenScaffold>
      <View style={styles.body}>
        <ArenaText variant="displayLarge" tone="primary">
          Arena
        </ArenaText>
        <ArenaText variant="bodySmall" tone="subtle">
          Phase 1 design system in place. The roster screen lands in Phase 3.
        </ArenaText>
        <Link href="/player/scaffold-id" style={styles.link}>
          <ArenaText variant="titleSmall" tone="accent">
            Open a player detail route
          </ArenaText>
        </Link>
        <Link href="/catalogue" style={styles.link}>
          <ArenaText variant="titleSmall" tone="accent">
            Open the component catalogue
          </ArenaText>
        </Link>
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
  link: { paddingVertical: space[4] },
});
