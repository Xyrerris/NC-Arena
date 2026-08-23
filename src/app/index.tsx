import { RosterScreen } from '@/features/roster';

/**
 * Roster route.
 *
 * Thin on purpose (ARCHITECTURE.md §4): the route layer wires and navigates, the feature
 * renders. Everything the screen needs arrives through `ArenaDataProvider` in `_layout`.
 */
export default function RosterRoute() {
  return <RosterScreen />;
}
