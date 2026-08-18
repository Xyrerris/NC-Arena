/**
 * In-memory preferences. Used by the Node test project, and as the fallback the app can
 * fall back to if MMKV ever fails to open — a preference is not worth a crash.
 */

import { isShortUnit, type ShortUnit } from '../common';
import { isRosterSort, type PlayerId, type RosterSort } from '../model';
import { DEFAULT_ROSTER_SORT, DEFAULT_SHORT_UNIT, type ArenaPreferences } from './types';

export const createMemoryPreferences = (
  initial: Partial<{ shortUnit: ShortUnit; rosterSort: RosterSort; viewerId: PlayerId }> = {},
): ArenaPreferences => {
  let shortUnit = isShortUnit(initial.shortUnit) ? initial.shortUnit : DEFAULT_SHORT_UNIT;
  let rosterSort = isRosterSort(initial.rosterSort) ? initial.rosterSort : DEFAULT_ROSTER_SORT;
  let viewerId: PlayerId | null = initial.viewerId ?? null;

  return {
    getShortUnit: () => shortUnit,
    setShortUnit: (unit) => {
      shortUnit = unit;
    },
    getRosterSort: () => rosterSort,
    setRosterSort: (sort) => {
      rosterSort = sort;
    },
    getViewerId: () => viewerId,
    setViewerId: (id) => {
      viewerId = id;
    },
  };
};
