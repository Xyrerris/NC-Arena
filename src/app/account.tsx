import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { AccountSetupScreen } from '@/features/accountSetup';

/**
 * Pairing a device later, after the first launch skipped it (ADR-0038). The same screen the
 * gate shows, reached from the "You" screen's `AccountConnectPrompt` instead of standing in
 * front of the app.
 *
 * Every way out goes back to where the user came from: linked, created and acknowledged, or
 * "Continue offline" again. The hand-entered players stay `LOCAL`, and the first sync after
 * pairing pushes them into the account.
 */
export default function AccountRoute() {
  const router = useRouter();
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // No swipe-back on iOS, for the reason the screen blocks Android's back button while the
  // recovery code is up. The screen's own buttons are the ways out.
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <AccountSetupScreen onDone={leave} />
    </>
  );
}
