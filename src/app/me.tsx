import { ViewerScreen } from '@/features/playerForm';

/**
 * "You" route (ADR-0022).
 *
 * Thin, like every other route: it names the screen and nothing else. `/me` is a static
 * segment at the root, so it cannot collide with `/player/[id]` — the two live in
 * different directories, and nothing here is a player id.
 */
export default function ViewerRoute() {
  return <ViewerScreen />;
}
