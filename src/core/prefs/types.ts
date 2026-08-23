/**
 * The preferences contract (ARCHITECTURE.md §7, "MMKV preferences").
 *
 * Reads are synchronous by design, not by convenience: the active sort is needed before
 * the first roster query runs, and an async read there means a frame of unsorted content
 * on every cold start. That requirement is what rules out AsyncStorage, so it is stated
 * in the interface rather than left implicit in the implementation.
 */

import type { ShortUnit } from '../common';
import type { PlayerId, RosterSort } from '../model';

export interface ArenaPreferences {
  getShortUnit(): ShortUnit;
  setShortUnit(unit: ShortUnit): void;

  /** Survives app restart — ROADMAP.md Phase 3 asserts exactly that. */
  getRosterSort(): RosterSort;
  setRosterSort(sort: RosterSort): void;

  /**
   * Null until the first sync. Open decision 3 ("how is your avatar identified?") is
   * still unanswered, so today this is whatever the roster source declares.
   */
  getViewerId(): PlayerId | null;
  setViewerId(id: PlayerId): void;

  /**
   * The season the last sync described. Null before the first one. It is a preference
   * rather than a column because it belongs to the snapshot as a whole, and giving a
   * single scalar its own table would be a migration for one integer (ADR-0018).
   */
  getSeason(): number | null;
  setSeason(season: number): void;
}

export const DEFAULT_SHORT_UNIT: ShortUnit = 'BILLIONS';
export const DEFAULT_ROSTER_SORT: RosterSort = 'RANK';

export const PREF_KEYS = {
  shortUnit: 'pref.shortUnit',
  rosterSort: 'pref.rosterSort',
  viewerId: 'pref.viewerId',
  season: 'pref.season',
} as const;
