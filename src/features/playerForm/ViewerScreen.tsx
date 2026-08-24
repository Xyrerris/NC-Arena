/**
 * "You" — the screen that says which player is yours and lets you keep their stats current
 * (ADR-0022).
 *
 * ADR-0020 decided this screen's shape before it existed: *like the add-player form, with
 * no create and no delete — you edit the viewer, you do not invent or remove them.* What it
 * could not decide was where the viewer comes from, because at the time only a sync could
 * name one. There is no sync and no seed (ADR-0021), so the screen answers that itself: it
 * asks which existing player you are, and then edits them.
 *
 * Two states, one route. The choice is not a separate page because it is not a separate
 * question — "who are you" and "what are your stats" are the same errand, and a user who
 * picked the wrong player must not have to leave and come back to correct it.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { useViewerId } from '@/core/data';

import { PlayerFormScreen } from './PlayerFormScreen';
import { ViewerChoiceScreen } from './ViewerChoiceScreen';

export function ViewerScreen() {
  const router = useRouter();
  const viewerId = useViewerId();

  /**
   * Re-opening the picker with a viewer already set. Component state rather than a route,
   * because "I want to change who I am" is a correction inside this screen — routing it
   * would put a page in the back stack whose only content is a list the user just left.
   */
  const [choosing, setChoosing] = useState(false);

  const leave = useCallback(() => {
    // The same rule the form and the detail screen follow: a deep link has no history
    // behind it, so `back()` would leave the app from a control that promises a screen.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const stopChoosing = useCallback(() => setChoosing(false), []);
  const startChoosing = useCallback(() => setChoosing(true), []);
  const addPlayer = useCallback(() => router.push('/player/new'), [router]);

  if (viewerId === null || choosing) {
    return (
      <ViewerChoiceScreen
        onChosen={stopChoosing}
        // Cancelling means "leave this as it was", and what that is depends on whether
        // there is anything to leave: with no viewer chosen it returns to the roster, and
        // with one it returns to their stats rather than to a roster the user did not ask
        // for. The roster keeps a control that reopens this, so neither is a dead end.
        onCancel={viewerId === null ? leave : stopChoosing}
        onAddPlayer={addPlayer}
      />
    );
  }

  return (
    <PlayerFormScreen mode={{ kind: 'viewer', id: viewerId }} onChangeViewer={startChoosing} />
  );
}
