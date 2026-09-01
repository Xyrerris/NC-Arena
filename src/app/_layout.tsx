import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ArenaDataProvider, type ArenaData } from '@/core/data';
import { arenaRepository } from '@/core/data/arenaRepository';
import { useExpoLiveData } from '@/core/data/expoLiveData';
import { useArenaMigrations } from '@/core/db/client';
import { ArenaText, color, layout, space, useArenaFonts } from '@/core/design-system';

/**
 * Root layout.
 *
 * This is the one place allowed to import core/db (ARCHITECTURE.md §7). Two things have to
 * finish before first paint and both are held behind the splash screen: the migrations and
 * the fonts. Every screen below can therefore assume the tables exist and that nothing will
 * reflow when a face swaps in.
 *
 * There used to be a third: the seed. It is gone (ADR-0021) — a new install opens on an
 * empty roster and the user adds the first player. What screens may assume is now weaker by
 * exactly one clause: the tables exist, but they may be **empty**. That is not a regression
 * to work around; the empty state was built in Phase 3 and is now the first thing a new
 * user sees rather than an edge case reachable only by a fruitless search.
 *
 * `GestureHandlerRootView` wraps everything below it because the roster's rows are
 * swipeable (ADR-0027). It is here rather than around that one list: a second gesture
 * anywhere in the app would otherwise silently do nothing on Android, which is the failure
 * mode this provider is famous for and the hardest kind to attribute.
 *
 * The `key` on the stack is the other half of ADR-0030. MainActivity now handles a font
 * scale change itself instead of being recreated for it, which is what keeps the photo
 * picker's launcher alive — but Android's recreation was also what re-measured the tree.
 * Without it the text grows inside boxes that were laid out for the old scale and the
 * screen clips, which is the exact failure the 200 % gate exists to catch. Remounting is
 * the honest equivalent of what recreation used to do, including its cost: the stack
 * returns to the roster, as it always did when the Activity came back.
 */
void SplashScreen.preventAutoHideAsync();

/**
 * The device wiring, in one value. Built at module scope rather than in the component so
 * the context identity never changes — a new object per render would re-subscribe every
 * live query in the tree on every render.
 */
const ARENA_DATA: ArenaData = { repository: arenaRepository, useLiveData: useExpoLiveData };

export default function RootLayout() {
  const { success, error } = useArenaMigrations();
  const fonts = useArenaFonts();
  const { fontScale } = useWindowDimensions();

  const failure = error ?? fonts.error;
  const ready = failure !== null || (success && fonts.loaded);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Splash stays up. Returning null rather than a spinner is deliberate: a spinner behind a
  // splash screen is invisible work that only makes the boot path harder to reason about.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {failure ? (
          <BootFailure message={failure.message} />
        ) : (
          <ArenaDataProvider value={ARENA_DATA}>
            <ArenaStack key={fontScale} />
          </ArenaDataProvider>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ArenaStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.backdrop },
      }}
    />
  );
}

function BootFailure({ message }: { message: string }) {
  return (
    <View style={styles.failure}>
      <ArenaText variant="displaySmall" tone="primary">
        Arena could not start
      </ArenaText>
      <ArenaText variant="bodySmall" tone="negative">
        {message}
      </ArenaText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  failure: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: color.backdrop,
    paddingHorizontal: layout.screenGutter,
    gap: space[8],
  },
});
