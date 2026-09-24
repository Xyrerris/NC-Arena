/**
 * MMKV-backed preferences. **Device-only** — `react-native-mmkv` is a native module, so
 * this file is not re-exported from `src/core/prefs/index.ts` for the same reason
 * `core/db/client.ts` is not: importing it would drag the Node test project onto a
 * runtime it cannot load.
 *
 * Every read is validated rather than cast. Persisted values outlive the code that wrote
 * them — a renamed sort key would otherwise come back as a `RosterSort` that no longer
 * exists and produce an empty list with no error anywhere.
 */

import { createMMKV } from 'react-native-mmkv';

import { isShortUnit } from '../common';
import { asPlayerId, isRosterSort } from '../model';
import { DEFAULT_ROSTER_SORT, DEFAULT_SHORT_UNIT, PREF_KEYS, type ArenaPreferences } from './types';

// react-native-mmkv 4 is Nitro-based: the instance comes from a factory, not a
// constructor. Pinned by ADR-0001, so this is the API for the life of SDK 57.
const storage = createMMKV({ id: 'arena.prefs' });

export const mmkvPreferences: ArenaPreferences = {
  getShortUnit: () => {
    const stored = storage.getString(PREF_KEYS.shortUnit);
    return isShortUnit(stored) ? stored : DEFAULT_SHORT_UNIT;
  },
  setShortUnit: (unit) => storage.set(PREF_KEYS.shortUnit, unit),

  getRosterSort: () => {
    const stored = storage.getString(PREF_KEYS.rosterSort);
    return isRosterSort(stored) ? stored : DEFAULT_ROSTER_SORT;
  },
  setRosterSort: (sort) => storage.set(PREF_KEYS.rosterSort, sort),

  getViewerId: () => {
    const stored = storage.getString(PREF_KEYS.viewerId);
    return stored === undefined || stored === '' ? null : asPlayerId(stored);
  },
  setViewerId: (id) => storage.set(PREF_KEYS.viewerId, id),
  // Removed rather than set to `''`. `getViewerId` reads both as "nobody", but a key that
  // is gone cannot be read back by a later version that stops treating the empty string
  // as absent.
  clearViewerId: () => {
    storage.remove(PREF_KEYS.viewerId);
  },

  getPendingViewerId: () => {
    const stored = storage.getString(PREF_KEYS.pendingViewerId);
    return stored === undefined || stored === '' ? null : asPlayerId(stored);
  },
  setPendingViewerId: (id) => storage.set(PREF_KEYS.pendingViewerId, id),
  clearPendingViewerId: () => {
    storage.remove(PREF_KEYS.pendingViewerId);
  },

  getSeason: () => {
    const stored = storage.getNumber(PREF_KEYS.season);
    // `undefined` is "never synced"; a non-integer is a value written by code that no
    // longer exists, and is treated the same way rather than rendered as "SEASON 41.5".
    return stored === undefined || !Number.isSafeInteger(stored) ? null : stored;
  },
  setSeason: (season) => storage.set(PREF_KEYS.season, season),

  getLastSyncedAt: () => {
    const stored = storage.getNumber(PREF_KEYS.lastSyncedAt);
    // Validated like the season, and for the same reason: a value written by code that no
    // longer exists, or a fractional one, would render as a staleness label nobody can
    // explain. `<= 0` catches a cleared-to-zero write as "never synced" too.
    return stored === undefined || !Number.isSafeInteger(stored) || stored <= 0 ? null : stored;
  },
  setLastSyncedAt: (at) => storage.set(PREF_KEYS.lastSyncedAt, at),
  clearLastSyncedAt: () => {
    storage.remove(PREF_KEYS.lastSyncedAt);
  },

  getApiKey: () => {
    const stored = storage.getString(PREF_KEYS.apiKey);
    return stored === undefined || stored === '' ? null : stored;
  },
  setApiKey: (key) => storage.set(PREF_KEYS.apiKey, key),
  // Removed rather than blanked, for the same reason as `clearViewerId`: a key that is gone
  // cannot be read back by a later version that stops treating the empty string as absent.
  clearApiKey: () => {
    storage.remove(PREF_KEYS.apiKey);
  },

  getSetupSkipped: () => storage.getBoolean(PREF_KEYS.setupSkipped) === true,
  setSetupSkipped: () => storage.set(PREF_KEYS.setupSkipped, true),
};
