/**
 * Player detail feature (ROADMAP.md Phase 4).
 *
 * This module may not import core/db or core/network, and may not import features/roster.
 * The repository arrives through `ArenaDataProvider`, which is what keeps that true.
 */

export { PlayerDetailScreen, type PlayerDetailScreenProps } from './PlayerDetailScreen';
export {
  DETAIL_TABS,
  STATS_FOOTER,
  toCompareRows,
  toHeadToHeadUi,
  toPlayerHeaderUi,
  toStatRows,
  toVerdict,
  toVersusUi,
  type CompareRowUi,
  type CompareSideUi,
  type HeadToHeadUi,
  type PlayerDetailEvent,
  type PlayerDetailTab,
  type PlayerDetailUiState,
  type PlayerHeaderUi,
  type StatRowUi,
  type VersusUi,
} from './playerDetailUiState';
export { usePlayerDetail, type PlayerDetailController } from './usePlayerDetail';
