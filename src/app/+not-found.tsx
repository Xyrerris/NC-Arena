import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ArenaText, ScreenScaffold, layout, space } from '@/core/design-system';

// Constants here rather than in a `strings.ts`: every file under `src/app` is a route, so a
// sibling strings module would become a screen.
const SCREEN_TITLE = 'Not found';
const MESSAGE = 'That screen does not exist.';
const BACK_LABEL = 'Back to the roster';

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
      <Stack.Screen options={{ title: SCREEN_TITLE }} />
      <ScreenScaffold>
        <View style={styles.body}>
          <ArenaText variant="displaySmall" tone="primary">
            {MESSAGE}
          </ArenaText>
          <Link href="/" style={styles.link}>
            <ArenaText variant="titleSmall" tone="accent">
              {BACK_LABEL}
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
