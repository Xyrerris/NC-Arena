import { PlayerFormScreen } from '@/features/playerForm';

/**
 * "Add a player" route.
 *
 * A **static** segment sitting beside the dynamic `player/[id]`, which is what makes
 * `/player/new` reach this file rather than the detail screen looking for a player called
 * "new" — Expo Router prefers a literal segment over a dynamic one. The cost is that a
 * player whose id were literally `new` would be unreachable, which is why locally created
 * ids are prefixed (`core/data/rosterRepository.ts`) rather than left free-form.
 */
export default function NewPlayerRoute() {
  return <PlayerFormScreen mode={{ kind: 'create' }} />;
}
