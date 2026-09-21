import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ArenaDataProvider, useNeedsAccount, type ArenaData } from '@/core/data';
import { arenaRepository } from '@/core/data/arenaRepository';
import { useExpoLiveData } from '@/core/data/expoLiveData';
import { useArenaMigrations } from '@/core/db/client';
import { ArenaText, color, layout, space, useArenaFonts } from '@/core/design-system';
import { AccountSetupScreen } from '@/features/accountSetup';

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

/**
 * TanStack Query's client, which §4 puts here among the providers and §7 explains the job
 * of: it owns the sync call's lifecycle, and nothing else.
 *
 * There is not a single `useQuery` in this app and there is not meant to be. SQLite is the
 * source of truth, screens read it through `useLiveQuery`, and the one thing this client
 * holds is `useRoster`'s sync mutation — so there is no cache here for a component to read
 * from, which is the §7 rule stated as a fact about the wiring rather than as a convention.
 *
 * At module scope so the client outlives a re-render, the same reason `ARENA_DATA` is.
 */
const queryClient = new QueryClient();

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
          <QueryClientProvider client={queryClient}>
            <ArenaDataProvider value={ARENA_DATA}>
              <ArenaGate fontScale={fontScale} />
            </ArenaDataProvider>
          </QueryClientProvider>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The setup gate (ADR-0035, decision 2). With a backend configured and no API key stored,
 * there is nothing the app can do until this device is paired, so the gate is what there is
 * instead of the stack — not a route, because a route would be somewhere the user could
 * navigate away from.
 *
 * **Whether setup is required is latched at mount, and that is load-bearing.** The key is
 * stored the moment the account exists, so `needsAccount` goes false while the recovery code
 * is still on screen. Reading it live would close the gate over the one and only time that
 * code is ever shown, and nothing — not the server, which keeps only its hash — could show
 * it again. So the gate opens on what was true at launch and closes when the screen says it
 * is done.
 *
 * `fontScale` keys the stack, not this component, for the same reason. The remount is what
 * re-measures the navigation tree after a font-scale change (ADR-0030); applying it here
 * would reset the latch and discard a recovery code mid-read if the user changed their font
 * size while it was up. The gate re-renders and re-lays-out like any other view.
 */
function ArenaGate({ fontScale }: { fontScale: number }) {
  const needsAccount = useNeedsAccount();
  const [required] = useState(needsAccount);
  const [done, setDone] = useState(false);

  // Stable, so the setup hook's memoised controller is not rebuilt on every render of this
  // component — `onDone` is a dependency of the submit handler it hands to the screen.
  const finish = useCallback(() => setDone(true), []);

  if (required && !done) return <AccountSetupScreen onDone={finish} />;

  return <ArenaStack key={fontScale} />;
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
