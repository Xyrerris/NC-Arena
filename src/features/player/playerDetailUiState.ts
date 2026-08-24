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
  played,
  rawStat,
  type HeadToHead,
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
  /** `"2,418,904,113"` or `"71.2043 %"`. Never ellipsised — it is the product's promise. */
  exact: string;
  /** `"2.42 B"` or `"71.2%"`. */
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
  /** `"+104.2%"`, or `"—"` where your value is zero and the ratio is undefined. */
  delta: string;
  opponentAhead: boolean;
}

export interface HeadToHeadUi {
  /** Null when the two have never met — the badge is replaced by the note. */
  record: { wins: number; losses: number } | null;
  /** `"you won 8 of 10 matches"`, or `"never fought"`. */
  note: string;
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
    };

export type PlayerDetailEvent = { type: 'selectTab'; tab: PlayerDetailTab } | { type: 'refresh' };

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

export const toPlayerHeaderUi = (player: Player): PlayerHeaderUi => ({
  name: player.name,
  rankLabel: `RANK #${String(player.rank).padStart(2, '0')}`,
  combatPowerExact: statFormatter.exact(player.combatPower),
  combatPowerShort: statFormatter.combatPowerShort(player.combatPower),
});

export const toHeadToHeadUi = (record: HeadToHead | null): HeadToHeadUi => {
  const matches = record === null ? 0 : played(record);
  if (record === null || matches === 0) {
    // No division happens on this path at all, which is how "zero-match opponents do not
    // divide by zero" is guaranteed rather than merely tested (ROADMAP.md Phase 4).
    return { record: null, note: 'never fought' };
  }
  return {
    record: { wins: record.wins, losses: record.losses },
    note: `you won ${record.wins} of ${matches} matches`,
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
  return { headToHead: toHeadToHeadUi(record), rows, verdict: toVerdict(rows) };
};

/** The Stats tab's footer, quoted from the design. */
export const STATS_FOOTER = 'exact value left · rounded value right';
