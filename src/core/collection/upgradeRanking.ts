/**
 * Which listings are worth buying as enhancement material, and in what order (the upgrade plan,
 * phase 1). Pure: the sheets and the listings go in, a ranking comes out.
 *
 * - `k = expOf(listing) / baseExp(item)`: how many "+0 pieces" of experience the listing holds.
 * - `R = price / k`: NCG per +0 equivalent. This is the owner's own reading of "price against items
 *   used" (a +3 at 5 NCG that holds 4.7 pieces is R 1.07).
 * - `ng = price / (exp / 1e9)`: NCG per Gexp. It is what grades are compared by, because a grade 9
 *   +0 piece and a grade 7 +0 piece are not the same size.
 *
 * Each grade has a **ceiling** on `ng` that falls from an opening value to a target (the market
 * opens high on a new grade and settles), and an **optimum** under which an offer is a bargain.
 * The ranking is `ng / ceiling` ascending — the share of the budget an offer spends — so a grade 9
 * at 2.5 /G (ceiling 12) outranks a grade 7 at 7.5 /G (ceiling 9.5), and ties go to the higher
 * grade. Numbers are measured on 2026-10-27 (docs/PLAN-upgrade-materials.md, "Ranges").
 *
 * The experience of a raised piece is the floor from its level: the stored `Exp` is not on the
 * listing (see `upgradeExp.ts`), so a raised piece is never ranked better than it is.
 */

import type { MarketListing } from '../common';
import { materialExp, type BaseExpByItem, type EnhancementExp } from './upgradeExp';

export interface GradeRange {
  /** The ceiling at the start date, in NCG per Gexp. */
  readonly opening: number;
  /** Where the ceiling stops falling. */
  readonly target: number;
  /** An offer at or under this is a bargain. */
  readonly optimum: number;
}

/** Grades 7 (Valkyrie), 8 (Transcendent) and 9 (Ultimate); a grade not here is not offered. */
export const GRADE_RANGES: Readonly<Record<number, GradeRange>> = {
  9: { opening: 12, target: 3, optimum: 1 },
  8: { opening: 11.5, target: 2.5, optimum: 0.8 },
  7: { opening: 9.5, target: 8, optimum: 4 },
};

/** When the ramp starts: the day the ranges above were measured against the market. */
export const RAMP_START = '2026-10-28';
/** The ceiling keeps this share of itself each month: four months from the opening to the target. */
export const RAMP_FACTOR = 0.7;
/** A grade with no range yet enters at this multiple of the cheapest price seen for it. */
export const NEW_GRADE_MARGIN = 1.1;

const MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000;

/** `max(target, opening * factor^months)`, months counted from `RAMP_START` and never negative. */
export const ceilingAt = (range: GradeRange, now: Date): number => {
  const months = Math.max(0, (now.getTime() - Date.parse(RAMP_START)) / MONTH_MS);
  return Math.max(range.target, range.opening * RAMP_FACTOR ** months);
};

/**
 * The range for a grade. A grade the table lacks (the game adds tiers every few months) is given one
 * from the cheapest price seen for it, `floors[grade]` in NCG per Gexp, with the lowest target and
 * optimum of the known grades; with no floor either it has none and is not offered.
 */
export const rangeFor = (
  grade: number,
  floors: Readonly<Record<number, number>> = {},
): GradeRange | null => {
  const known = GRADE_RANGES[grade];
  if (known !== undefined) return known;
  const floor = floors[grade];
  if (floor === undefined || !(floor > 0)) return null;
  const ranges = Object.values(GRADE_RANGES);
  const target = Math.min(...ranges.map((range) => range.target));
  const optimum = Math.min(...ranges.map((range) => range.optimum));
  return { opening: Math.max(target, floor * NEW_GRADE_MARGIN), target, optimum };
};

export type Band = 'optimum' | 'within' | 'over';

export interface ScoredMaterial {
  readonly listing: MarketListing;
  /** The experience the piece gives as material (a floor for a raised piece). */
  readonly exp: number;
  /** `exp` in units of the item's own +0 experience. */
  readonly k: number;
  /** NCG per +0 equivalent: `price / k`. */
  readonly r: number;
  /** NCG per Gexp. */
  readonly ng: number;
  readonly ceiling: number;
  readonly band: Band;
  /** `ng / ceiling`: the share of the budget the offer spends; what the list is ordered by. */
  readonly share: number;
}

/** The listing's numbers, or null when the sheets cannot say what it gives (never a guess). */
export const scoreMaterial = (
  listing: MarketListing,
  base: BaseExpByItem,
  levels: EnhancementExp,
  range: GradeRange,
  ceiling: number,
): ScoredMaterial | null => {
  const baseExp = base.get(listing.itemId)?.exp;
  const exp = materialExp(base, levels, listing.itemId, listing.level);
  if (baseExp === undefined || baseExp <= 0 || exp === null || exp <= 0) return null;
  const k = exp / baseExp;
  const ng = listing.price / (exp / 1e9);
  return {
    listing,
    exp,
    k,
    r: listing.price / k,
    ng,
    ceiling,
    band: ng <= range.optimum ? 'optimum' : ng <= ceiling ? 'within' : 'over',
    share: ng / ceiling,
  };
};

export interface RankOptions {
  readonly now: Date;
  /** Replaces the ceiling of a grade (the screen lets the owner edit it), in NCG per Gexp. */
  readonly ceilings?: Readonly<Record<number, number>>;
  /** The cheapest NCG per Gexp seen per grade, for grades with no range yet. */
  readonly floors?: Readonly<Record<number, number>>;
  /** Keep only pieces raised above +0. */
  readonly onlyRaised?: boolean;
  /** The buyer's own agent: a purchase refuses its listings. */
  readonly ownAgentAddress?: string;
}

export interface MaterialRanking {
  /** Within the ceiling, best first. */
  readonly offers: readonly ScoredMaterial[];
  /** Over the ceiling: counted by the screen, not listed. */
  readonly over: number;
  /** Within the ceiling but at +0, left out because `onlyRaised` is on: for "N at +0 qualify". */
  readonly leftOutAtZero: number;
  /** Listings the sheets or the ranges cannot value. */
  readonly unvalued: number;
}

/** Ranks the listings; see the file comment for the order. */
export function rankMaterials(
  listings: readonly MarketListing[],
  base: BaseExpByItem,
  levels: EnhancementExp,
  options: RankOptions,
): MaterialRanking {
  const offers: ScoredMaterial[] = [];
  let over = 0;
  let leftOutAtZero = 0;
  let unvalued = 0;

  for (const listing of listings) {
    if (listing.sellerAgentAddress === options.ownAgentAddress) continue;
    const range = rangeFor(listing.grade, options.floors);
    const scored =
      range === null
        ? null
        : scoreMaterial(
            listing,
            base,
            levels,
            range,
            options.ceilings?.[listing.grade] ?? ceilingAt(range, options.now),
          );
    if (scored === null) {
      unvalued += 1;
    } else if (scored.band === 'over') {
      over += 1;
    } else if (options.onlyRaised === true && listing.level === 0) {
      leftOutAtZero += 1;
    } else {
      offers.push(scored);
    }
  }

  offers.sort(
    (a, b) =>
      a.share - b.share ||
      b.listing.grade - a.listing.grade ||
      a.listing.price - b.listing.price ||
      a.listing.productId.localeCompare(b.listing.productId),
  );
  return { offers, over, leftOutAtZero, unvalued };
}

/**
 * The cheapest NCG per Gexp seen for each grade the table has no range for, from the listings read.
 * It is what `rangeFor` opens a new grade at; the grades with a range are left out.
 */
export function observedFloors(
  listings: readonly MarketListing[],
  base: BaseExpByItem,
  levels: EnhancementExp,
): Record<number, number> {
  const floors: Record<number, number> = {};
  for (const listing of listings) {
    if (GRADE_RANGES[listing.grade] !== undefined) continue;
    const exp = materialExp(base, levels, listing.itemId, listing.level);
    if (exp === null || exp <= 0) continue;
    const ng = listing.price / (exp / 1e9);
    const best = floors[listing.grade];
    if (best === undefined || ng < best) floors[listing.grade] = ng;
  }
  return floors;
}
