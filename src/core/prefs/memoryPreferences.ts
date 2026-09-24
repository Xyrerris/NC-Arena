/**
 * In-memory preferences. Used by the Node test project, and as the fallback the app can
 * fall back to if MMKV ever fails to open — a preference is not worth a crash.
 */

import { isShortUnit, type ShortUnit } from '../common';
import { isRosterSort, type PlayerId, type RosterSort } from '../model';
import { DEFAULT_ROSTER_SORT, DEFAULT_SHORT_UNIT, type ArenaPreferences } from './types';

export const createMemoryPreferences = (
  initial: Partial<{
    shortUnit: ShortUnit;
    rosterSort: RosterSort;
    viewerId: PlayerId;
    season: number;
    lastSyncedAt: number;
    apiKey: string;
  }> = {},
): ArenaPreferences => {
  let shortUnit = isShortUnit(initial.shortUnit) ? initial.shortUnit : DEFAULT_SHORT_UNIT;
  let rosterSort = isRosterSort(initial.rosterSort) ? initial.rosterSort : DEFAULT_ROSTER_SORT;
  let viewerId: PlayerId | null = initial.viewerId ?? null;
  let pendingViewerId: PlayerId | null = null;
  let season: number | null = initial.season ?? null;
  let lastSyncedAt: number | null = initial.lastSyncedAt ?? null;
  let apiKey: string | null = initial.apiKey ?? null;
  let setupSkipped = false;

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
    clearViewerId: () => {
      viewerId = null;
    },
    getPendingViewerId: () => pendingViewerId,
    setPendingViewerId: (id) => {
      pendingViewerId = id;
    },
    clearPendingViewerId: () => {
      pendingViewerId = null;
    },
    getSeason: () => season,
    setSeason: (next) => {
      season = next;
    },
    getLastSyncedAt: () => lastSyncedAt,
    setLastSyncedAt: (at) => {
      lastSyncedAt = at;
    },
    clearLastSyncedAt: () => {
      lastSyncedAt = null;
    },
    getApiKey: () => apiKey,
    setApiKey: (key) => {
      apiKey = key;
    },
    clearApiKey: () => {
      apiKey = null;
    },
    getSetupSkipped: () => setupSkipped,
    setSetupSkipped: () => {
      setupSkipped = true;
    },
  };
};
