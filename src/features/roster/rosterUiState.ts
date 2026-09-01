/**
 * The roster screen's state, exactly as ARCHITECTURE.md §8 specifies it: a discriminated
 * union, so `error` with rows or `empty` with a viewer cannot be represented.
 *
 * Everything here is a **pre-formatted string**. A component never calls the formatter —
 * that is what lets the §6 formatting contract be tested without rendering anything, and
 * it is what the §4 boundary exists to protect.
 *
 * Three of these states — loading, empty, error — do not exist in the prototype at all.
 * Searching for a player who is not there renders a blank screen (defect 5). They are new
 * work, and they are the reason this file is a union rather than an object with a
 * `isLoading` flag beside a `rows` array.
 */

import { statFormatter } from '@/core/common';
import type { MatchOutcome, Player, PlayerId, RosterEntry, RosterSort } from '@/core/model';

/** Wins and losses stay numeric: `RecordBadge` owns how a record reads and announces. */
export interface RosterRecordUi {
  wins: number;
  losses: number;
}

export interface ViewerCardUi {
  name: string;
  rank: number;
  score: number;
  /** `"2.145.880"` and `"2,15 M"` — the product's "every huge stat shown twice" promise. */
  combatPowerExact: string;
  combatPowerShort: string;
}

export interface RosterRowUi {
  /** The stable server id. Navigation is keyed on this, never on the name (defect 2). */
  id: PlayerId;
  name: string;
  /** Zero-padded, so the rank column does not jitter between 9 and 10 mid-scroll. */
  rankLabel: string;
  combatPowerExact: string;
  scoreLabel: string;
  record: RosterRecordUi | null;
  isViewer: boolean;
  /**
   * Whether a swipe on this row may record a match (ADR-0027). False for your own row —
   * there is no record against yourself — and false for **every** row while no avatar has
   * been chosen, because a result is yours against them and there is no "yours" yet.
   *
   * It is a field on the row rather than a check inside the row component because the
   * component would have to be told who the viewer is to make it, and a list item that
   * knows about the viewer is a list item that re-renders when the viewer changes.
   */
  canRecord: boolean;
  /**
   * Added on this device rather than synced (ADR-0020). It is announced rather than drawn:
   * the design has no badge for it, and inventing one here would put a mark on the roster
   * that never went past design review. The detail screen is where a local player's edit
   * control lives, and that control is the visible difference.
   */
  isLocal: boolean;
}

/**
 * Everything above the list: the count line, the viewer's hero card, and which sort is
 * selected. It is a separate shape because it is shared by `ready` and `empty` — see the
 * note on the union below.
 */
export interface RosterHeaderUi {
  /**
   * `"SEASON 41"`, or null before the first sync has said which season this is. Rendering
   * nothing beats rendering a guess.
   */
  seasonLabel: string | null;
  /**
   * Null before the first sync has said who "you" are — open decision 3. The roster is
   * still worth rendering without it, so this is a missing card rather than a state.
   */
  viewer: ViewerCardUi | null;
  /** The whole roster, not the rows a search left behind. */
  totalPlayers: number;
  sort: RosterSort;
}

/**
 * `empty` carries the header, which ARCHITECTURE.md §8's sketch does not — see ADR-0018.
 * The header is not part of the list, so a search that matches nothing must not take the
 * viewer card and the sort chips down with it. That failure *is* defect 5, in a new
 * costume: the prototype's blank screen came from the same reasoning.
 */
export type RosterUiState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; canRetry: boolean }
  /** The search matched nothing. `query` is empty only if the roster itself is empty. */
  | { kind: 'empty'; query: string; header: RosterHeaderUi }
  | {
      kind: 'ready';
      header: RosterHeaderUi;
      rows: readonly RosterRowUi[];
      query: string;
      isRefreshing: boolean;
      /**
       * Why the last swipe recorded nothing, or null. It is a *line above the list* rather
       * than the `error` state, because a refused increment is not a broken ladder — and
       * taking the roster down to report one would be defect 5 with a new cause.
       */
      recordError: string | null;
    };

export type RosterEvent =
  | { type: 'search'; query: string }
  | { type: 'sort'; sort: RosterSort }
  | { type: 'refresh' }
  /** One match against `id`, from a swipe or from the row's accessibility action. */
  | { type: 'record'; id: PlayerId; outcome: MatchOutcome };

/** Label and order from the prototype's three chips. */
export const SORT_OPTIONS: readonly { sort: RosterSort; label: string }[] = [
  { sort: 'RANK', label: 'RANK' },
  { sort: 'COMBAT_POWER', label: 'CP' },
  { sort: 'MY_WINS', label: 'MY WINS' },
] as const;

/**
 * Open decision 8 asked where the prototype's hard-coded "SEASON 41" comes from. It comes
 * from the source: a snapshot carries `season`, the preferences remember it, and
 * the repository caches it (ADR-0018). Nothing here invents a number.
 */
export const seasonLabel = (season: number | null): string | null =>
  season === null ? null : `SEASON ${season}`;

const rankLabel = (rank: number): string => String(rank).padStart(2, '0');

export const toViewerCardUi = (viewer: Player): ViewerCardUi => ({
  name: viewer.name,
  rank: viewer.rank,
  score: viewer.score,
  combatPowerExact: statFormatter.exact(viewer.combatPower),
  combatPowerShort: statFormatter.combatPowerShort(viewer.combatPower),
});

/**
 * @param hasViewer whether an avatar has been chosen. Passed in rather than derived from
 * `entry.isViewer`: with no avatar *every* entry reports `isViewer: false`, so a row could
 * not tell "you are someone else" from "there is no you yet" — and the second of those is
 * the one where a swipe has nothing to record.
 */
export const toRosterRowUi = (entry: RosterEntry, hasViewer: boolean): RosterRowUi => ({
  id: entry.player.id,
  name: entry.player.name,
  rankLabel: rankLabel(entry.player.rank),
  combatPowerExact: statFormatter.exact(entry.player.combatPower),
  scoreLabel: `${entry.player.score} pts`,
  // The viewer has no head-to-head against themselves, so their own row shows no badge.
  record: entry.isViewer || entry.record === null ? null : entry.record,
  isViewer: entry.isViewer,
  canRecord: hasViewer && !entry.isViewer,
  isLocal: entry.origin === 'LOCAL',
});

export const playerCountLabel = (total: number): string =>
  `${total} registered ${total === 1 ? 'player' : 'players'}`;
