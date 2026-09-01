/**
 * The player detail screen's state (ARCHITECTURE.md §8, same contract as the roster's).
 *
 * Everything is pre-formatted here rather than in a component, which is what keeps the §6
 * formatting contract in one tested module. The two representations of every stat — exact
 * and rounded — are both computed here, because the design's own footer promises both and
 * a component that could render one without the other would let that promise rot.
 */

import { statFormatter, type ShortUnit } from '@/core/common';
import {
  STAT_KEYS,
  gameCodeLabel,
  played,
  rawStat,
  type HeadToHead,
  type MatchDelta,
  type MatchOutcome,
  type Player,
  type PlayerId,
  type StatKey,
} from '@/core/model';

export type PlayerDetailTab = 'STATS' | 'VS_YOU';

export const DETAIL_TABS: readonly { value: PlayerDetailTab; label: string }[] = [
  { value: 'STATS', label: 'STATS' },
  { value: 'VS_YOU', label: 'VS YOU' },
] as const;

export interface StatRowUi {
  key: StatKey;
  label: string;
  /** `"2.418.904.113"` or `"71,2043 %"`. Never ellipsised — it is the product's promise. */
  exact: string;
  /** `"2,42 B"` or `"71,2%"`. */
  short: string;
}

export interface CompareSideUi {
  exact: string;
  short: string;
  /** 0..1 of the larger of the two values, so the wider bar is always full. */
  fraction: number;
}

export interface CompareRowUi {
  key: StatKey;
  label: string;
  mine: CompareSideUi;
  theirs: CompareSideUi;
  /** `"+104,2%"`, or `"—"` where your value is zero and the ratio is undefined. */
  delta: string;
  opponentAhead: boolean;
}

export interface HeadToHeadUi {
  /** Null when the two have never met — the badge is replaced by the note. */
  record: { wins: number; losses: number } | null;
  /** `"you won 8 of 10 matches"`, or `"never fought"`. */
  note: string;
  /**
   * Whether the stepper is offered at all (ADR-0029). False on your own page: the Vs You tab
   * still renders there, comparing you against yourself, but there is no record between one
   * player and themselves to move.
   */
  canAdjust: boolean;
  /**
   * Whether a `-1` has anything to take back. A record counts matches that happened, so
   * neither column goes below zero, and the control that cannot act is disabled rather than
   * removed: a stepper missing one of its two buttons reads as a layout fault, not as a
   * floor. `core/db` refuses it as well — this only keeps the press from being offered.
   */
  canRemoveWin: boolean;
  canRemoveLoss: boolean;
}

export interface VersusUi {
  headToHead: HeadToHeadUi;
  rows: readonly CompareRowUi[];
  /** `"you lead in 3 of 5 stats · delta shown from your values"`. */
  verdict: string;
}

export interface PlayerHeaderUi {
  name: string;
  /** `"RANK #09"` — zero-padded, as the prototype pads it. */
  rankLabel: string;
  /**
   * `"LV. 488 · #a984"`, or just one half of it, or null.
   *
   * One string rather than two fields, because the two are read together and neither is
   * worth a line of its own: the game prints them on one row beside the name, and a header
   * that stacked "level" and "code" as separate labelled rows would give an identifier
   * nobody looks up the same weight as the stats underneath it.
   */
  identityLabel: string | null;
  combatPowerExact: string;
  combatPowerShort: string;
}

export type PlayerDetailUiState =
  | { kind: 'loading' }
  /**
   * File-based routing makes `player/<unknown-id>` a URL anyone can reach, so this is a
   * state rather than an impossibility (ROADMAP.md Phase 4).
   */
  | { kind: 'notFound'; id: PlayerId }
  | { kind: 'error'; message: string; canRetry: boolean }
  | {
      kind: 'ready';
      tab: PlayerDetailTab;
      header: PlayerHeaderUi;
      /**
       * True only for a player added on this device (ADR-0020). A synced row is not
       * editable, so the control is absent rather than present-and-refusing — an affordance
       * that explains why it will not work is still an affordance that does not work.
       */
      canEdit: boolean;
      stats: readonly StatRowUi[];
      /**
       * Null before the first sync has said who "you" are — open decision 3. The Stats tab
       * is fully readable without a viewer; Vs You is the half that has nothing to say.
       */
      versus: VersusUi | null;
      /**
       * Why the last step of the record changed nothing, or null. It sits above the tab
       * rather than replacing the screen, for the reason the roster's own line gives: a
       * refused increment is not a broken stat book.
       */
      recordError: string | null;
    };

export type PlayerDetailEvent =
  | { type: 'selectTab'; tab: PlayerDetailTab }
  | { type: 'refresh' }
  /** One match on or off your record against this player (ADR-0029). */
  | { type: 'adjustRecord'; outcome: MatchOutcome; delta: MatchDelta };

/**
 * CRIT is stored in basis points and every other stat is a raw count, so `rawStat`
 * deliberately refuses to return it under one type (core/model). Both callers below need
 * *a* number on a consistent scale, and comparing critBp against critBp is exactly as
 * valid as comparing atk against atk — the unit only matters at the formatter.
 */
const scaledValue = (player: Player, key: StatKey): number =>
  key === 'CRIT' ? player.critBp : rawStat(player, key);

const exactOf = (player: Player, key: StatKey): string =>
  key === 'CRIT'
    ? statFormatter.critExact(player.critBp)
    : statFormatter.exact(rawStat(player, key));

const shortOf = (player: Player, key: StatKey, unit: ShortUnit): string =>
  key === 'CRIT'
    ? statFormatter.critShort(player.critBp)
    : statFormatter.short(rawStat(player, key), unit);

export const toStatRows = (player: Player, unit: ShortUnit): StatRowUi[] =>
  STAT_KEYS.map((key) => ({
    key,
    label: key,
    exact: exactOf(player, key),
    short: shortOf(player, key, unit),
  }));

/**
 * Level 0 is "nobody recorded one", not "a brand new account": the column defaults to 0 for
 * every row written before the field existed (ADR-0023), so rendering it would put `LV. 0`
 * on players whose level the app simply never knew.
 */
const identityLabel = (player: Player): string | null => {
  const parts = [
    player.level > 0 ? `LV. ${player.level}` : null,
    gameCodeLabel(player.gameCode) === '' ? null : gameCodeLabel(player.gameCode),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
};

export const toPlayerHeaderUi = (player: Player): PlayerHeaderUi => ({
  name: player.name,
  rankLabel: `RANK #${String(player.rank).padStart(2, '0')}`,
  identityLabel: identityLabel(player),
  combatPowerExact: statFormatter.exact(player.combatPower),
  combatPowerShort: statFormatter.combatPowerShort(player.combatPower),
});

export const toHeadToHeadUi = (record: HeadToHead | null, canAdjust: boolean): HeadToHeadUi => {
  // Read off the record rather than off the badge: a pairing that exists with 0–0 shows no
  // badge and still has nothing to take back, and one that has never been written has the
  // same two zeroes. The stepper cannot tell them apart and does not need to.
  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const steps = {
    canAdjust,
    canRemoveWin: canAdjust && wins > 0,
    canRemoveLoss: canAdjust && losses > 0,
  };

  const matches = record === null ? 0 : played(record);
  if (record === null || matches === 0) {
    // No division happens on this path at all, which is how "zero-match opponents do not
    // divide by zero" is guaranteed rather than merely tested (ROADMAP.md Phase 4).
    return { record: null, note: 'never fought', ...steps };
  }
  return {
    record: { wins: record.wins, losses: record.losses },
    note: `you won ${record.wins} of ${matches} matches`,
    ...steps,
  };
};

export const toCompareRows = (viewer: Player, opponent: Player, unit: ShortUnit): CompareRowUi[] =>
  STAT_KEYS.map((key) => {
    const mine = scaledValue(viewer, key);
    const theirs = scaledValue(opponent, key);
    const largest = Math.max(mine, theirs);
    // Both bars are relative to the larger value, so the stronger side is always full and
    // the weaker one is read as a proportion of it. A zero maximum means two zeroes, and
    // two empty bars is the honest picture.
    const fractionOf = (value: number) => (largest === 0 ? 0 : value / largest);

    return {
      key,
      label: key,
      mine: {
        exact: exactOf(viewer, key),
        short: shortOf(viewer, key, unit),
        fraction: fractionOf(mine),
      },
      theirs: {
        exact: exactOf(opponent, key),
        short: shortOf(opponent, key, unit),
        fraction: fractionOf(theirs),
      },
      delta: statFormatter.deltaPercent(mine, theirs),
      // A tie is NOT the opponent being ahead — see `toVerdict`, which is where that
      // choice actually shows.
      opponentAhead: theirs > mine,
    };
  });

/**
 * The prototype counts `mine >= theirs` as a lead, so an exact tie falls in your favour.
 * ROADMAP.md Phase 4 asks for that to be confirmed or changed rather than inherited by
 * accident: it is **kept**, and asserted, so changing it is a product decision with a
 * failing test attached rather than a silent edit (ADR-0019).
 */
export const toVerdict = (rows: readonly CompareRowUi[]): string => {
  const ahead = rows.filter((row) => !row.opponentAhead).length;
  return `you lead in ${ahead} of ${rows.length} stats · delta shown from your values`;
};

export const toVersusUi = (
  viewer: Player,
  opponent: Player,
  record: HeadToHead | null,
  unit: ShortUnit,
): VersusUi => {
  const rows = toCompareRows(viewer, opponent, unit);
  // Both players are in hand here, so "is this my own page" is answered where it is cheap
  // rather than passed down as one more argument the caller could get wrong.
  return {
    headToHead: toHeadToHeadUi(record, viewer.id !== opponent.id),
    rows,
    verdict: toVerdict(rows),
  };
};

/** The Stats tab's footer, quoted from the design. */
export const STATS_FOOTER = 'exact value left · rounded value right';
