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
};
