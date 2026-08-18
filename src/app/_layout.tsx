import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { arenaRepository } from '@/core/data/arenaRepository';
import { useArenaMigrations } from '@/core/db/client';

/**
 * Root layout.
 *
 * This is the one place allowed to import core/db (ARCHITECTURE.md §7): migrations run
 * once here, and first paint is held behind the splash screen until both they and the
 * Phase 2 seed have finished. Every screen below can therefore assume the tables exist
 * and have rows — no "is the database ready?" branch in any feature.
 *
 * Phase 1 adds font loading to the same gate and replaces the literal colours below with
 * design tokens.
 */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { success, error } = useArenaMigrations();
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

  const failure = error ?? seedError;
  const ready = failure !== null || (success && bootstrapped);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Splash stays up. Returning null rather than a spinner is deliberate: a spinner behind
  // a splash screen is invisible work that only makes the boot path harder to reason about.
  if (!ready) return null;

  if (failure) {
    return (
      <View style={styles.failure}>
        <StatusBar style="light" />
        {/* TODO(phase-1): this is the one screen with no design-system components yet. */}
        <Text style={styles.failureTitle}>Arena could not start</Text>
        <Text style={styles.failureDetail}>{failure.message}</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          // TODO(phase-1): tokens.color.backdrop. The "no raw hex outside
          // core/design-system" lint rule lands with the token module.
          contentStyle: { backgroundColor: '#07100d' },
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  failure: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  failureTitle: { color: '#e8efec', fontSize: 20 },
  failureDetail: { color: '#e0705f', fontSize: 14 },
});
