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
   * Forgets who you are, without answering the question differently.
   *
   * `setViewerId` selects an existing row, so it has no way to express "nobody" — and a
   * stored id pointing at a row that is no longer there is not the same state as never
   * having chosen: the roster loses its hero card with nothing on screen saying why. A
   * restore that carries no avatar is the first caller (ADR-0033); the delete path is the
   * second one it is owed (ROADMAP.md 4.10.4).
   */
  clearViewerId(): void;

  /**
   * The viewer picked on this device that the server has not been told about yet, or null
   * (ADR-0037). The account has one viewer upstream, and a sync applies the server's; while
   * this is set, the sync seats this one upstream first and a pull may not replace it.
   */
  getPendingViewerId(): PlayerId | null;
  setPendingViewerId(id: PlayerId): void;
  clearPendingViewerId(): void;

  /**
   * The season the last sync described. Null before the first one. It is a preference
   * rather than a column because it belongs to the snapshot as a whole, and giving a
   * single scalar its own table would be a migration for one integer (ADR-0018).
   */
  getSeason(): number | null;
  setSeason(season: number): void;

  /**
   * When a snapshot from the server was last written to this device, as epoch
   * milliseconds. Null before the first sync — and the roster renders no staleness label
   * at all rather than guessing, the same rule `getSeason` follows.
   *
   * It is set where `setSeason` is, because it is the same kind of fact: a scalar that
   * belongs to the snapshot as a whole rather than to any row in it.
   */
  getLastSyncedAt(): number | null;
  setLastSyncedAt(at: number): void;
  /**
   * Forgets when the ladder last came from the server. A **restore** is the caller
   * (ADR-0033): it replaces every row from a file, so a timestamp left behind would date
   * rows the server never sent. Back to null is the honest answer — the same "render
   * nothing rather than a guess" the season label already makes.
   */
  clearLastSyncedAt(): void;

  /**
   * This device's bearer token for the backend — null until an account exists (ADR-0035,
   * decision 2). `core/network` takes it as a constructor argument and cannot read it
   * itself: `core/data` is the only layer allowed to reach `core/prefs` (§4), so it is also
   * the only layer that can hand one over.
   *
   * It lives here, beside `viewerId` and the sort, rather than in a store of its own. The
   * ADR is explicit that this is not an authentication system: the key identifies whose
   * roster a request is about, the way `viewerId` identifies which row is you. A second
   * store would imply a security boundary MMKV does not provide and this product does not
   * claim — see the addendum in ADR-0035 for what that does and does not mean.
   */
  getApiKey(): string | null;
  setApiKey(key: string): void;
  /**
   * Forgets the account this device was paired to. The counterpart to `clearViewerId`, and
   * owed for the same reason: a key the server no longer recognises is not the same state
   * as never having paired, and only one of the two should send the user back to setup.
   */
  clearApiKey(): void;
}

export const DEFAULT_SHORT_UNIT: ShortUnit = 'BILLIONS';
export const DEFAULT_ROSTER_SORT: RosterSort = 'RANK';

export const PREF_KEYS = {
  shortUnit: 'pref.shortUnit',
  rosterSort: 'pref.rosterSort',
  viewerId: 'pref.viewerId',
  pendingViewerId: 'pref.pendingViewerId',
  season: 'pref.season',
  lastSyncedAt: 'pref.lastSyncedAt',
  apiKey: 'pref.apiKey',
} as const;
