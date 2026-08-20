import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ArenaText, ScreenScaffold, layout, space } from '@/core/design-system';

/**
 * Catch-all for unmatched routes.
 *
 * Present from Phase 0 because file-based routing makes bad URLs reachable via deep
 * links from outside the app. The *in-app* not-found case — a valid route shape with an
 * unknown player id — is a separate concern and a Phase 4 exit criterion.
 */
export default function NotFoundRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <ScreenScaffold>
        <View style={styles.body}>
          <ArenaText variant="displaySmall" tone="primary">
            That screen does not exist.
          </ArenaText>
          <Link href="/" style={styles.link}>
            <ArenaText variant="titleSmall" tone="accent">
              Back to the roster
            </ArenaText>
          </Link>
        </View>
      </ScreenScaffold>
    </>
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
