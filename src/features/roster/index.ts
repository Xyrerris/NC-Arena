/**
 * Roster feature (ROADMAP.md Phase 3).
 *
 * This module may not import core/db or core/network, and may not import features/player.
 * The repository arrives through `ArenaDataProvider`, which is what keeps that true.
 */

export { RosterRow, type RosterRowProps } from './RosterRow';
export { RosterScreen } from './RosterScreen';
export {
  SORT_OPTIONS,
  playerCountLabel,
  seasonLabel,
  toRosterRowUi,
  toViewerCardUi,
  type RosterEvent,
  type RosterHeaderUi,
  type RosterRecordUi,
  type RosterRowUi,
  type RosterUiState,
  type ViewerCardUi,
} from './rosterUiState';
export { SEARCH_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue';
export { useRoster, type RosterController } from './useRoster';
