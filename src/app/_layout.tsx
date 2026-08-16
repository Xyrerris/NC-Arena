import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

/**
 * Root layout.
 *
 * Phase 2 adds the SQLite provider and `useMigrations` here — this is the one place
 * allowed to import core/db (ARCHITECTURE.md §7), and the boundary config in
 * eslint.config.js reflects that.
 * Phase 1 adds font loading and replaces the literal colour below with a design token.
 */
export default function RootLayout() {
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
