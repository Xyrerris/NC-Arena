import { useLocalSearchParams } from 'expo-router';

import { asPlayerId } from '@/core/model';
import { PlayerDetailScreen } from '@/features/player';

/**
 * Player detail route.
 *
 * Thin, like the roster route: the route layer resolves the parameter, the feature renders.
 *
 * `id` arrives as a plain string, and this is the one place it becomes a `PlayerId`
 * (ARCHITECTURE.md §5). The Phase 0 note here said to brand it only after confirming the
 * row exists — which is not something a route can do, since the row lives behind a live
 * query. The confirmation moved into the screen instead: an id that matches nothing renders
 * the not-found state, which is a Phase 4 exit criterion and is tested as one. Branding is
 * erased at runtime, so nothing is claimed by doing it here that the screen does not check.
 */
export default function PlayerDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <PlayerDetailScreen id={asPlayerId(id ?? '')} />;
}
