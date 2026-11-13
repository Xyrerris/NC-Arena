/**
 * What it takes to raise one owned piece to a target level, from the material on sale (the upgrade
 * plan, phase 5). Pure: the piece, the offers already ranked and the sheets go in, a plan comes out.
 *
 * - **What is needed** is the experience of the target level (`EnhancementCostSheetV3.exp`, cumulative
 *   from +0) less the experience the piece holds. The piece's stored `Exp` is on the node and is
 *   total from +0 (a +0 grade 9 ring already holds 9.6 G), so it is not recomputed from the level.
 * - **What is bought** is the cheapest set of offers whose experience reaches that: the cheapest per
 *   Gexp first, and the last one swapped for the cheapest single offer that covers what is left, so a
 *   large piece is not bought to fill a small gap. A single offer that covers everything for less than
 *   the set wins. This is a good answer, not a proof of the optimum.
 * - **The NCG of the upgrade** is the sheet's `cost`, cumulative like the experience: the step from
 *   `from` to `to` costs `cost[to] - cost[from]`, whatever the number of actions it takes.
 * - **Actions**: an `ItemEnhancement` takes at most 50 materials.
 *
 * The experience of a raised offer is the floor from its level (see `upgradeExp.ts`), so the plan
 * may buy a little more than it needs, never less.
 */

import { equipmentRoute } from './marketMatch';
import { upgradeNcg, type EnhancementCosts } from './upgradeCost';
import type { BaseExpByItem, EnhancementExp } from './upgradeExp';
import type { ScoredMaterial } from './upgradeRanking';

export const MAX_MATERIALS_PER_ACTION = 50;

export interface PlanTarget {
  readonly itemId: number;
  readonly level: number;
  /** The experience the piece holds now, from +0. */
  readonly exp: number;
}

export interface UpgradePlan {
  readonly itemId: number;
  readonly from: number;
  readonly to: number;
  /** The experience still to gain; 0 when the piece already holds enough. */
  readonly neededExp: number;
  readonly picks: readonly ScoredMaterial[];
  readonly materialExp: number;
  /** What the picks give beyond what is needed (0 when the offers fall short). */
  readonly surplus: number;
  /** What is still missing when the offers cannot reach the target (0 when they can). */
  readonly shortfall: number;
  readonly materialNcg: number;
  /** The NCG the upgrade itself costs; null when the cost sheet is missing or lacks the levels. */
  readonly upgradeNcg: number | null;
  /** `materialNcg + upgradeNcg`; null when the upgrade cost is not known. */
  readonly total: number | null;
  readonly actions: number;
}

const slotGradeLevels = (
  base: BaseExpByItem,
  levels: EnhancementExp,
  itemId: number,
): { readonly curve: readonly number[]; readonly slot: string; readonly grade: number } | null => {
  const item = base.get(itemId);
  const curve = item === undefined ? undefined : levels.get(`${item.slot}|${item.grade}`);
  return item === undefined || curve === undefined
    ? null
    : { curve, slot: item.slot, grade: item.grade };
};

/** The highest level the sheet knows for the piece, or null when it does not know the piece. */
export const maxLevelOf = (
  base: BaseExpByItem,
  levels: EnhancementExp,
  itemId: number,
): number | null => {
  const found = slotGradeLevels(base, levels, itemId);
  return found === null ? null : found.curve.length - 1;
};

const priceOf = (picks: readonly ScoredMaterial[]): number =>
  picks.reduce((sum, { listing }) => sum + listing.price, 0);
const expOf = (picks: readonly ScoredMaterial[]): number =>
  picks.reduce((sum, { exp }) => sum + exp, 0);

/** The cheapest offers that reach `needed`, or the best effort (all of them in order) when none do. */
const choose = (needed: number, offers: readonly ScoredMaterial[]): readonly ScoredMaterial[] => {
  if (needed <= 0) return [];
  const byValue = [...offers].sort(
    (a, b) =>
      a.ng - b.ng ||
      a.listing.price - b.listing.price ||
      a.listing.productId.localeCompare(b.listing.productId),
  );

  const greedy: ScoredMaterial[] = [];
  let have = 0;
  for (const offer of byValue) {
    if (have >= needed) break;
    greedy.push(offer);
    have += offer.exp;
  }
  if (have < needed) return greedy;

  // Swap the last pick for the cheapest unused offer that still covers what is left.
  const last = greedy[greedy.length - 1] as ScoredMaterial;
  const rest = needed - (have - last.exp);
  const used = new Set(greedy.map((offer) => offer.listing.productId));
  const cover = byValue
    .filter((offer) => !used.has(offer.listing.productId) && offer.exp >= rest)
    .sort((a, b) => a.listing.price - b.listing.price)[0];
  const tuned =
    cover !== undefined && cover.listing.price < last.listing.price
      ? [...greedy.slice(0, -1), cover]
      : greedy;

  // One offer that covers it all for less than the set.
  const single = byValue
    .filter((offer) => offer.exp >= needed)
    .sort((a, b) => a.listing.price - b.listing.price)[0];
  return single !== undefined && single.listing.price < priceOf(tuned) ? [single] : tuned;
};

/**
 * The plan to raise `target` to `to`, or null when `to` is not above the level, the sheets do not know
 * the piece, or the sheet has no such level.
 */
export function planUpgrade(
  target: PlanTarget,
  to: number,
  offers: readonly ScoredMaterial[],
  base: BaseExpByItem,
  levels: EnhancementExp,
  costs: EnhancementCosts | null,
): UpgradePlan | null {
  const found = slotGradeLevels(base, levels, target.itemId);
  const goal = found?.curve[to];
  if (found === null || goal === undefined || to <= target.level) return null;

  const neededExp = Math.max(0, goal - target.exp);
  const picks = choose(neededExp, offers);
  const materialExp = expOf(picks);
  const route = equipmentRoute(found.slot);
  const upgrade =
    costs === null || route === undefined
      ? null
      : upgradeNcg(costs, route, found.grade, target.level, to);
  const materialNcg = priceOf(picks);
  return {
    itemId: target.itemId,
    from: target.level,
    to,
    neededExp,
    picks,
    materialExp,
    surplus: Math.max(0, materialExp - neededExp),
    shortfall: Math.max(0, neededExp - materialExp),
    materialNcg,
    upgradeNcg: upgrade,
    total: upgrade === null ? null : materialNcg + upgrade,
    actions: Math.ceil(picks.length / MAX_MATERIALS_PER_ACTION),
  };
}
