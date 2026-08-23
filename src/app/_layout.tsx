import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ArenaDataProvider, type ArenaData } from '@/core/data';
import { arenaRepository } from '@/core/data/arenaRepository';
import { useExpoLiveData } from '@/core/data/expoLiveData';
import { useArenaMigrations } from '@/core/db/client';
import { ArenaText, color, layout, space, useArenaFonts } from '@/core/design-system';

/**
 * Root layout.
 *
 * This is the one place allowed to import core/db (ARCHITECTURE.md §7). Three things have
 * to finish before first paint, and all three are held behind the splash screen: the
 * migrations, the Phase 2 seed, and the fonts. Every screen below can therefore assume the
 * tables exist, have rows, and will not reflow when a face swaps in.
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
  const [bootstrapped, setBootstrapped] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);

  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    void arenaRepository.ensureSeeded().then((result) => {
      if (cancelled) return;
      if (!result.ok) setSeedError(result.error);
      setBootstrapped(true);
    });
    return () => {
      cancelled = true;
    };
  }, [success]);

  const failure = error ?? seedError ?? fonts.error;
  const ready = failure !== null || (success && bootstrapped && fonts.loaded);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Splash stays up. Returning null rather than a spinner is deliberate: a spinner behind a
  // splash screen is invisible work that only makes the boot path harder to reason about.
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {failure ? (
        <BootFailure message={failure.message} />
      ) : (
        <ArenaDataProvider value={ARENA_DATA}>
          <ArenaStack />
        </ArenaDataProvider>
      )}
    </SafeAreaProvider>
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
  failure: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: color.backdrop,
    paddingHorizontal: layout.screenGutter,
    gap: space[8],
  },
});
