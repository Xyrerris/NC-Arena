import { useLocalSearchParams } from 'expo-router';

import { asPlayerId } from '@/core/model';
import { PlayerFormScreen } from '@/features/playerForm';

/**
 * "Edit this player" route.
 *
 * `player/edit/[id]` rather than `player/[id]/edit`, so the existing `player/[id].tsx` stays
 * a file. Turning it into a directory to gain one sibling would move a route that is already
 * deep-linked, referenced by the Maestro flow and asserted by name in two test files — for
 * no behavioural gain.
 *
 * The id is branded here, as in `player/[id].tsx`, and for the same reason: branding is
 * erased at runtime, so nothing is claimed that the screen does not then check. An id that
 * matches no local player renders the form's `unavailable` state.
 */
export default function EditPlayerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <PlayerFormScreen mode={{ kind: 'edit', id: asPlayerId(id ?? '') }} />;
}
